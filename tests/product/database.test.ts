import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const A = "10000000-0000-4000-8000-000000000001",
  B = "10000000-0000-4000-8000-000000000002";
const T = "20000000-0000-4000-8000-000000000001",
  U = "20000000-0000-4000-8000-000000000002";
const P = "30000000-0000-4000-8000-000000000001",
  Q = "30000000-0000-4000-8000-000000000002",
  R = "30000000-0000-4000-8000-000000000003";
const E = "40000000-0000-4000-8000-000000000001",
  F = "40000000-0000-4000-8000-000000000002";
test("Postgres: isolated owners, atomic expenses, cent sums and conflict checks", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
    );
    await db.exec(
      readFileSync(
        new URL(
          "../../supabase/migrations/202609080001_initial.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.query("insert into auth.users values ($1),($2)", [A, B]);
    await db.query(
      "insert into teams(id,owner_id,name) values($1,$2,$3),($4,$5,$6)",
      [T, A, "Team A", U, B, "Team B"],
    );
    await db.query(
      "insert into players(id,team_id,name) values($1,$2,$3),($4,$2,$5),($6,$7,$8)",
      [P, T, "One", Q, "Two", R, U, "Other"],
    );
    async function as(user: string) {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        user,
      ]);
      await db.exec("set role authenticated");
    }
    await as(A);
    assert.equal((await db.query("select * from teams")).rows.length, 1);
    assert.equal((await db.query("select * from players")).rows.length, 2);
    await assert.rejects(
      db.query("insert into players(team_id,name) values($1,$2)", [
        U,
        "Injected",
      ]),
    );
    await assert.rejects(
      db.query("update teams set owner_id=$1 where id=$2", [B, T]),
    );
    await assert.rejects(
      db.query("update players set team_id=$1 where id=$2", [U, P]),
    );
    await assert.rejects(
      db.query(
        "insert into expenses(id,team_id,title,amount_cents,date) values($1,$2,'Bypass',100,'2026-09-08')",
        [E, T],
      ),
    );
    async function save(
      team: string,
      id: string,
      amount: number,
      ids: string[],
      rev = 0,
    ) {
      return db.query(
        "select save_expense($1,$2,'Kenttä',$3,'2026-09-08',$4::uuid[],$5)",
        [team, id, amount, ids, rev],
      );
    }
    await assert.rejects(save(T, E, 100, [P, R]));
    await assert.rejects(save(T, E, 100, [P, P]));
    await assert.rejects(save(T, E, 100, []));
    await assert.rejects(save(U, E, 100, [R]));
    await save(T, E, 101, [P, Q]);
    const shares = await db.query<{
      player_id: string;
      amount_cents: number;
    }>("select player_id,amount_cents from expense_shares order by player_id");
    assert.deepEqual(
      shares.rows.map((x) => x.amount_cents),
      [51, 50],
    );
    await assert.rejects(db.query("update expense_shares set amount_cents=0"));
    await assert.rejects(db.query("delete from expense_shares"));
    await db.query("update players set active=false where id=$1", [P]);
    await save(T, E, 103, [P, Q], 1); // existing archived participation retained
    await assert.rejects(save(T, F, 100, [P])); // archived player cannot join a new expense
    await assert.rejects(save(T, E, 999, [Q], 1)); // stale revision
    await assert.rejects(save(T, E, 999, [Q, R], 2)); // no partial write on validation failure
    assert.equal(
      (
        await db.query<{
          amount_cents: number;
        }>("select amount_cents from expenses where id=$1", [E])
      ).rows[0].amount_cents,
      103,
    );
    assert.equal(
      (
        await db.query<{
          total: number;
        }>(
          "select sum(amount_cents)::int as total from expense_shares where expense_id=$1",
          [E],
        )
      ).rows[0].total,
      103,
    );
    await as(B);
    assert.equal((await db.query("select * from expenses")).rows.length, 0);
    assert.equal(
      (await db.query("select * from expense_shares")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query("update players set name=$1 where id=$2 returning id", [
          "hacked",
          P,
        ])
      ).rows.length,
      0,
    );
    await assert.rejects(save(T, E, 1, [P], 2));
    await assert.rejects(db.query("select delete_expense($1,2)", [E]));
    await db.exec("reset role;set role anon");
    await assert.rejects(db.query("select * from teams"));
    await assert.rejects(db.query("select delete_expense($1,2)", [E]));
    await as(A);
    await assert.rejects(db.query("select delete_expense($1,1)", [E]));
    await db.query("select delete_expense($1,2)", [E]);
    assert.equal(
      (await db.query("select * from expense_shares")).rows.length,
      0,
    );
    assert.equal((await db.query("select * from expenses")).rows.length, 0);
  } finally {
    await db.close();
  }
});
