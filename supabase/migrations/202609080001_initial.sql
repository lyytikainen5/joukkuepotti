-- Joukkuepotti v1: one private team per owner. No public/player sharing yet.
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 60),
  created_at timestamptz not null default now()
);
create table public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 60),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (team_id, id)
);
create unique index players_team_name on public.players (team_id, lower(name));
create table public.expenses (
  id uuid primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  title text not null check (title = btrim(title) and char_length(title) between 1 and 80),
  amount_cents integer not null check (amount_cents between 1 and 100000000),
  date date not null,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, id)
);
create index expenses_team_date on public.expenses (team_id, date desc);
create table public.expense_shares (
  team_id uuid not null,
  expense_id uuid not null,
  player_id uuid not null,
  amount_cents integer not null check (amount_cents >= 0),
  primary key (expense_id, player_id),
  foreign key (team_id, expense_id) references public.expenses(team_id, id) on delete cascade,
  foreign key (team_id, player_id) references public.players(team_id, id)
);
create index expense_shares_player on public.expense_shares(team_id, player_id);

alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_shares enable row level security;
revoke all on public.teams, public.players, public.expenses, public.expense_shares from anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.teams, public.players, public.expenses, public.expense_shares to authenticated;
grant insert (owner_id, name) on public.teams to authenticated;
grant update (name) on public.teams to authenticated;
grant insert (team_id, name) on public.players to authenticated;
grant update (name, active) on public.players to authenticated;

create policy teams_read on public.teams for select to authenticated using (owner_id = (select auth.uid()));
create policy teams_create on public.teams for insert to authenticated with check (owner_id = (select auth.uid()));
create policy teams_edit on public.teams for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy players_read on public.players for select to authenticated using (exists (select 1 from public.teams t where t.id = team_id and t.owner_id = (select auth.uid())));
create policy players_create on public.players for insert to authenticated with check (exists (select 1 from public.teams t where t.id = team_id and t.owner_id = (select auth.uid())));
create policy players_edit on public.players for update to authenticated using (exists (select 1 from public.teams t where t.id = team_id and t.owner_id = (select auth.uid()))) with check (exists (select 1 from public.teams t where t.id = team_id and t.owner_id = (select auth.uid())));
create policy expenses_read on public.expenses for select to authenticated using (exists (select 1 from public.teams t where t.id = team_id and t.owner_id = (select auth.uid())));
create policy shares_read on public.expense_shares for select to authenticated using (exists (select 1 from public.teams t where t.id = team_id and t.owner_id = (select auth.uid())));

-- All expense writes go through atomic functions. Clients cannot alter shares.
create function public.save_expense(p_team_id uuid, p_id uuid, p_title text, p_amount integer, p_date date, p_participants uuid[], p_expected_revision integer default 0)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  current_revision integer;
  n integer;
  valid_players integer;
begin
  if auth.uid() is null or not exists (select 1 from public.teams where id = p_team_id and owner_id = auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_id is null or p_title is null or char_length(btrim(p_title)) not between 1 and 80 or p_amount is null or p_amount not between 1 and 100000000 or p_date is null or p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'invalid expense' using errcode = '22023';
  end if;
  n := cardinality(p_participants);
  if n is null or n < 1 or n > 500 or array_position(p_participants, null) is not null or (select count(distinct x) from unnest(p_participants) x) <> n then
    raise exception 'invalid participants' using errcode = '22023';
  end if;
  -- Serialize changes to an existing expense; compare revision after locking.
  select revision into current_revision from public.expenses where id = p_id and team_id = p_team_id for update;
  if current_revision is null then
    if p_expected_revision <> 0 then raise exception 'conflict' using errcode = '40001'; end if;
  elsif current_revision <> p_expected_revision then
    raise exception 'conflict' using errcode = '40001';
  end if;
  select count(*) into valid_players from public.players p
  where p.team_id = p_team_id and p.id = any(p_participants)
  and (p.active or exists(select 1 from public.expense_shares s where s.expense_id = p_id and s.player_id = p.id));
  if valid_players <> n then raise exception 'invalid participants' using errcode = '22023'; end if;
  if current_revision is null then
    insert into public.expenses(id,team_id,title,amount_cents,date) values(p_id,p_team_id,btrim(p_title),p_amount,p_date);
  else
    update public.expenses set title=btrim(p_title),amount_cents=p_amount,date=p_date,revision=revision+1,updated_at=now() where id=p_id and team_id=p_team_id;
    delete from public.expense_shares where expense_id=p_id;
  end if;
  insert into public.expense_shares(team_id,expense_id,player_id,amount_cents)
    select p_team_id,p_id,player_id,p_amount/n + case when ord <= p_amount%n then 1 else 0 end
    from unnest(p_participants) with ordinality as participants(player_id,ord);
  return p_id;
end;
$$;
create function public.delete_expense(p_id uuid,p_expected_revision integer)
returns void language plpgsql security definer set search_path = '' as $$
declare item public.expenses%rowtype;
begin
  select e.* into item from public.expenses e join public.teams t on t.id=e.team_id where e.id=p_id and t.owner_id=auth.uid() for update of e;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_expected_revision is null or item.revision <> p_expected_revision then raise exception 'conflict' using errcode='40001'; end if;
  delete from public.expenses where id=p_id;
end;
$$;
revoke all on function public.save_expense(uuid,uuid,text,integer,date,uuid[],integer) from public,anon;
revoke all on function public.delete_expense(uuid,integer) from public,anon;
grant execute on function public.save_expense(uuid,uuid,text,integer,date,uuid[],integer) to authenticated;
grant execute on function public.delete_expense(uuid,integer) to authenticated;
