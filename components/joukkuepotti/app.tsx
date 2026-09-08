"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, ArrowUpRight, RefreshCw } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Toaster, toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  demoSnapshot,
  divideExpense,
  money,
  playerTotals,
  type Expense,
  type ExpenseDraft,
  type Player,
  type Snapshot,
} from "@/lib/joukkuepotti/model";
import {
  errorMessage,
  getSupabase,
  loadSnapshot,
  saveExpense,
} from "@/lib/joukkuepotti/supabase";
import { ExpenseForm } from "./expense-form";
import { Auth } from "./auth";
const empty: Snapshot = { team: null, players: [], expenses: [] };
export function Joukkuepotti() {
  const [db, setDb] = useState<SupabaseClient | null>(null),
    [ready, setReady] = useState(false),
    [uid, setUid] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>(empty),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState("");
  const [recovery, setRecovery] = useState(false),
    [tab, setTab] = useState("overview");
  const [expenseModal, setExpenseModal] = useState<{
      expense?: Expense;
    } | null>(null),
    [playerModal, setPlayerModal] = useState<{
      player?: Player;
    } | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null),
    [deleteError, setDeleteError] = useState(""),
    [busy, setBusy] = useState(false);
  const epoch = useRef(0),
    dbRef = useRef<SupabaseClient | null>(null),
    uidRef = useRef<string | null>(null);
  const demo = ready && !db;
  useEffect(() => {
    const client = getSupabase();
    setDb(client);
    dbRef.current = client;
    if (!client) {
      setSnapshot(demoSnapshot());
      setLoading(false);
      setReady(true);
      return;
    }
    let alive = true;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      const nextUid = session?.user.id ?? null;
      if (nextUid !== uidRef.current) {
        epoch.current++;
        setSnapshot(empty);
        setLoading(!!nextUid);
        setLoadError("");
        setExpenseModal(null);
        setPlayerModal(null);
        setDeleting(null);
        uidRef.current = nextUid;
        setUid(nextUid);
      }
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") setRecovery(false);
      setReady(true);
      if (!nextUid) setLoading(false);
    });
    return () => {
      alive = false;
      epoch.current++;
      subscription.unsubscribe();
    };
  }, []);
  async function refresh() {
    const client = dbRef.current;
    if (!client || !uidRef.current) return;
    const ticket = ++epoch.current;
    setLoading(true);
    setLoadError("");
    try {
      const data = await loadSnapshot(client);
      if (ticket === epoch.current) setSnapshot(data);
    } catch {
      if (ticket === epoch.current)
        setLoadError(
          "Tietoja ei voitu hakea. Tarkista verkkoyhteys ja päivitä tiedot.",
        );
    } finally {
      if (ticket === epoch.current) setLoading(false);
    }
  }
  useEffect(() => {
    if (db && uid) void refresh();
  }, [db, uid]);
  async function mutation(work: () => Promise<void>) {
    try {
      await work();
    } catch (e) {
      throw new Error(errorMessage(e));
    }
    // Do not report a committed write as failed if the subsequent read fails.
    if (db) await refresh();
  }
  async function save(draft: ExpenseDraft) {
    if (!snapshot.team) throw new Error("Luo ensin joukkue.");
    if (db) await mutation(() => saveExpense(db, snapshot.team!.id, draft));
    else {
      const e: Expense = {
        id: draft.id ?? crypto.randomUUID(),
        team_id: snapshot.team.id,
        title: draft.title,
        amount_cents: draft.amount_cents,
        date: draft.date,
        revision: (draft.expected_revision ?? 0) + 1,
        shares: divideExpense(draft.amount_cents, draft.participant_ids),
      };
      setSnapshot((s) => ({
        ...s,
        expenses: draft.id
          ? s.expenses.map((x) => (x.id === e.id ? e : x))
          : [e, ...s.expenses],
      }));
    }
    toast.success(draft.id ? "Kulu päivitetty" : "Kulu jaettu osallistujille");
  }
  async function savePlayer(name: string, player?: Player) {
    if (!snapshot.team) throw new Error("Luo ensin joukkue.");
    if (
      snapshot.players.some(
        (p) =>
          p.id !== player?.id &&
          p.name.toLocaleLowerCase("fi") === name.toLocaleLowerCase("fi"),
      )
    )
      throw new Error("Nimi on jo käytössä. Lisää tarvittaessa sukunimi.");
    if (db)
      await mutation(async () => {
        const result = player
          ? await db
              .from("players")
              .update({ name })
              .eq("id", player.id)
              .select("id")
              .single()
          : await db
              .from("players")
              .insert({ team_id: snapshot.team!.id, name })
              .select("id")
              .single();
        if (result.error) throw result.error;
      });
    else
      setSnapshot((s) => ({
        ...s,
        players: player
          ? s.players.map((p) => (p.id === player.id ? { ...p, name } : p))
          : [
              ...s.players,
              {
                id: crypto.randomUUID(),
                team_id: s.team!.id,
                name,
                active: true,
              },
            ],
      }));
    toast.success(player ? "Pelaajan nimi päivitetty" : "Pelaaja lisätty");
  }
  async function archive(player: Player) {
    setBusy(true);
    try {
      if (db)
        await mutation(async () => {
          const { error } = await db
            .from("players")
            .update({ active: !player.active })
            .eq("id", player.id)
            .select("id")
            .single();
          if (error) throw error;
        });
      else
        setSnapshot((s) => ({
          ...s,
          players: s.players.map((p) =>
            p.id === player.id ? { ...p, active: !p.active } : p,
          ),
        }));
      toast.success(
        player.active
          ? "Pelaaja arkistoitu. Aiemmat kulut säilyvät."
          : "Pelaaja palautettu kokoonpanoon",
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function removeExpense() {
    if (!deleting) return;
    setBusy(true);
    setDeleteError("");
    try {
      if (db)
        await mutation(async () => {
          const { error } = await db.rpc("delete_expense", {
            p_id: deleting.id,
            p_expected_revision: deleting.revision,
          });
          if (error) throw error;
        });
      else
        setSnapshot((s) => ({
          ...s,
          expenses: s.expenses.filter((e) => e.id !== deleting.id),
        }));
      setDeleting(null);
      toast.success("Kulu poistettu");
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createTeam(name: string) {
    if (db)
      await mutation(async () => {
        const { error } = await db
          .from("teams")
          .insert({ name, owner_id: uid })
          .select("id")
          .single();
        if (error) throw error;
      });
    else
      setSnapshot({
        team: { id: "demo-own", name, owner_id: "demo" },
        players: [],
        expenses: [],
      });
    setTab("players");
  }
  const total = snapshot.expenses.reduce((sum, e) => sum + e.amount_cents, 0),
    totals = playerTotals(snapshot),
    active = snapshot.players.filter((p) => p.active),
    blocked = loading || !!loadError || busy;
  const sortedExpenses = [...snapshot.expenses].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  function addExpense() {
    if (!active.length) {
      setTab("players");
      toast.info("Lisää ensin pelaaja kokoonpanoon.");
      return;
    }
    setExpenseModal({});
  }
  function expenseRows(detailed = false) {
    return sortedExpenses.length ? (
      sortedExpenses.map((e) => (
        <article className="expense" key={e.id}>
          <div className="icon" aria-hidden="true">
            <ArrowUpRight />
          </div>
          <div className="info">
            <strong>{e.title}</strong>
            <p className="meta">
              {new Intl.DateTimeFormat("fi-FI", {
                day: "numeric",
                month: "numeric",
                year: "numeric",
              }).format(new Date(e.date + "T12:00:00"))}{" "}
              · {e.shares.length} osallistujaa
            </p>
            {detailed && (
              <>
                <details className="participant-split">
                  <summary>Näytä pelaajien osuudet</summary>
                  <ul>
                    {e.shares.map((s) => (
                      <li key={s.player_id}>
                        <span>
                          {snapshot.players.find((p) => p.id === s.player_id)
                            ?.name ?? "Pelaaja"}
                        </span>
                        <span>{money(s.amount_cents)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
                <div className="expenseactions">
                  <button
                    disabled={blocked}
                    onClick={() => setExpenseModal({ expense: e })}
                  >
                    Muokkaa
                  </button>
                  <button
                    disabled={blocked}
                    onClick={() => {
                      setDeleting(e);
                      setDeleteError("");
                    }}
                  >
                    Poista
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="money">
            {money(e.amount_cents)}
            <small>
              {money(Math.floor(e.amount_cents / e.shares.length))}
              {e.amount_cents % e.shares.length
                ? "–" + money(Math.ceil(e.amount_cents / e.shares.length))
                : ""}{" "}
              / hlö
            </small>
          </div>
        </article>
      ))
    ) : (
      <div className="empty">
        <h3>Ensimmäinen yhteinen kulu?</h3>
        <p>Lisää kenttävuoro tai joukkueen hankinta.</p>
        <button className="primary" disabled={blocked} onClick={addExpense}>
          Lisää kulu
        </button>
      </div>
    );
  }
  function playerRows(editable = false) {
    return snapshot.players.length ? (
      snapshot.players.map((p) => (
        <div className={`player ${p.active ? "" : "archived"}`} key={p.id}>
          <div className="avatar" aria-hidden="true">
            {p.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="playername">
            {p.name}
            {!p.active && <p className="meta">Arkistoitu</p>}
          </div>
          <span className="money">{money(totals[p.id] ?? 0)}</span>
          {editable && (
            <div className="person-actions">
              <button
                disabled={blocked}
                onClick={() => setPlayerModal({ player: p })}
              >
                Muokkaa
              </button>
              <button disabled={blocked} onClick={() => archive(p)}>
                {p.active ? "Arkistoi" : "Palauta"}
              </button>
            </div>
          )}
        </div>
      ))
    ) : (
      <div className="empty">
        <h3>Ketkä pelaavat mukana?</h3>
        <p>Lisää ensimmäinen pelaaja.</p>
      </div>
    );
  }
  return (
    <>
      <header>
        <a className="brand" href="/">
          <span className="mark">JP</span>Joukkuepotti
        </a>
        <div className="toolbar">
          <span className="header-status">
            {demo ? "ESITTELYVERSIO" : uid ? "OMA JOUKKUE" : ""}
          </span>
          {uid && (
            <button
              disabled={busy}
              onClick={async () => {
                const { error } = await db!.auth.signOut();
                if (error)
                  toast.error(
                    "Uloskirjautuminen ei onnistunut. Yritä uudelleen.",
                  );
              }}
            >
              Kirjaudu ulos
            </button>
          )}
        </div>
      </header>
      <main>
        {!ready ? (
          <p className="loading" role="status">
            Avataan Joukkuepottia…
          </p>
        ) : db && (!uid || recovery) ? (
          <Auth
            db={db}
            recovery={recovery}
            onRecovered={() => setRecovery(false)}
          />
        ) : (
          <>
            {demo && (
              <div className="notice warning">
                <span>
                  Esittelyversio · Muutokset häviävät sivun päivityksessä.
                  Oikeiden tietojen tallennus ei ole vielä käytössä.
                </span>
              </div>
            )}
            {loadError && (
              <div className="errorbox" role="alert">
                {loadError}
                <button className="textbtn" onClick={() => refresh()}>
                  Yritä uudelleen
                </button>
              </div>
            )}
            {loading && !snapshot.team ? (
              <p className="loading" role="status">
                Haetaan joukkueen tietoja…
              </p>
            ) : !snapshot.team && !loadError ? (
              <TeamForm onSave={createTeam} />
            ) : (
              snapshot.team && (
                <>
                  <div className="heading">
                    <div>
                      <p className="eyebrow">JOUKKUEEN TYÖPÖYTÄ</p>
                      <h1>{snapshot.team.name}</h1>
                      <p className="muted">
                        Yhteiset kulut. Jokaisen oma osuus.
                      </p>
                    </div>
                    <button
                      className="primary"
                      disabled={blocked}
                      onClick={addExpense}
                    >
                      <Plus
                        size={18}
                        className="inline mr-2"
                        aria-hidden="true"
                      />
                      Lisää kulu
                    </button>
                  </div>
                  <div className="notice">
                    <span>
                      {demo
                        ? "Kokeile esimerkkijoukkueella tai aloita omasta kokoonpanosta."
                        : loading
                          ? "Päivitetään tietoja…"
                          : "Kulut jaetaan osallistujille. Maksuja ei vielä seurata."}
                    </span>
                    {demo ? (
                      <button
                        className="textbtn"
                        onClick={() => {
                          setSnapshot(empty);
                          setTab("players");
                        }}
                      >
                        Aloita oma joukkue
                      </button>
                    ) : (
                      <button
                        className="textbtn"
                        disabled={blocked}
                        onClick={() => refresh()}
                      >
                        <RefreshCw
                          size={14}
                          className="inline mr-1"
                          aria-hidden="true"
                        />
                        Päivitä tiedot
                      </button>
                    )}
                  </div>
                  <Tabs
                    value={tab}
                    onValueChange={setTab}
                    className="workspace-tabs"
                  >
                    <TabsList variant="line" aria-label="Joukkueen näkymät">
                      <TabsTrigger value="overview">Yhteenveto</TabsTrigger>
                      <TabsTrigger value="expenses">
                        Kulut ({snapshot.expenses.length})
                      </TabsTrigger>
                      <TabsTrigger value="players">
                        Pelaajat ({active.length})
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="overview">
                      <section
                        className="stats"
                        aria-label="Kulujen yhteenveto"
                      >
                        <div className="stat feature">
                          <label>Joukkueen kulut yhteensä</label>
                          <strong>{money(total)}</strong>
                          <small>
                            {snapshot.expenses.length} yhteistä kulua
                          </small>
                        </div>
                        <div className="stat">
                          <label>Pelaajia kokoonpanossa</label>
                          <strong>{active.length}</strong>
                          <small>
                            {snapshot.players.length - active.length}{" "}
                            arkistoitua pelaajaa
                          </small>
                        </div>
                        <div className="stat">
                          <label>Jaettuja kuluja</label>
                          <strong>{snapshot.expenses.length}</strong>
                          <small>Jokainen sentti mukana</small>
                        </div>
                      </section>
                      <div className="grid">
                        <section className="panel">
                          <div className="panelhead">
                            <h2>Yhteiset kulut</h2>
                            <button
                              className="textbtn"
                              onClick={() => setTab("expenses")}
                            >
                              Näytä kaikki
                            </button>
                          </div>
                          {expenseRows()}
                        </section>
                        <section className="panel">
                          <div className="panelhead">
                            <div>
                              <h2>Pelaajien osuudet</h2>
                              <p>Kaikki jaetut kulut yhteensä</p>
                            </div>
                          </div>
                          {playerRows()}
                          <p className="footnote">
                            Nämä ovat kuluosuuksia, eivät avoimia maksuja.
                          </p>
                        </section>
                      </div>
                    </TabsContent>
                    <TabsContent value="expenses">
                      <section className="panel">
                        <div className="panelhead">
                          <div>
                            <h2>Joukkueen kulut</h2>
                            <p>
                              {snapshot.expenses.length} kulua · yhteensä{" "}
                              {money(total)}
                            </p>
                          </div>
                        </div>
                        {expenseRows(true)}
                      </section>
                    </TabsContent>
                    <TabsContent value="players">
                      <section className="panel">
                        <div className="panelhead">
                          <div>
                            <h2>Kokoonpano</h2>
                            <p>{active.length} aktiivista pelaajaa</p>
                          </div>
                          <button
                            className="primary"
                            disabled={blocked}
                            onClick={() => setPlayerModal({})}
                          >
                            ＋ Lisää pelaaja
                          </button>
                        </div>
                        {playerRows(true)}
                        <p className="footnote">
                          Arkistointi poistaa pelaajan uusien kulujen
                          oletusvalinnoista. Aiemmat osuudet säilyvät.
                        </p>
                      </section>
                    </TabsContent>
                  </Tabs>
                </>
              )
            )}
          </>
        )}
      </main>
      <footer>
        JOUKKUEPOTTI<span>Enemmän peliä, vähemmän laskemista.</span>
      </footer>
      {expenseModal && (
        <ExpenseForm
          players={snapshot.players}
          expense={expenseModal.expense}
          onClose={() => setExpenseModal(null)}
          onSave={save}
        />
      )}
      {playerModal && (
        <PlayerForm
          player={playerModal.player}
          onClose={() => setPlayerModal(null)}
          onSave={savePlayer}
        />
      )}
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Poistetaanko {deleting?.title}?</AlertDialogTitle>
          <AlertDialogDescription>
            Kulu ja siihen liittyvät pelaajien osuudet poistuvat. Tätä ei voi
            perua.
          </AlertDialogDescription>
          {deleteError && (
            <p className="inline-error" role="alert">
              {deleteError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Peruuta</AlertDialogCancel>
            <button className="danger" disabled={busy} onClick={removeExpense}>
              {busy ? "Poistetaan…" : "Poista kulu"}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Toaster position="bottom-center" richColors />
    </>
  );
}
function TeamForm({ onSave }: { onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="setup">
      <p className="eyebrow">ENSIMMÄINEN ASKEL</p>
      <h1>Mikä teidän joukkueen nimi on?</h1>
      <p className="muted">
        Lisäät seuraavaksi pelaajat. Sitten voit jakaa ensimmäisen yhteisen
        kulun.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setBusy(true);
          setError("");
          try {
            await onSave(name.trim());
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Joukkueen nimi
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={60}
            placeholder="Esim. FC Kaverit"
            disabled={busy}
          />
        </label>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Luodaan joukkuetta…" : "Luo joukkue"}
        </button>
      </form>
    </section>
  );
}
function PlayerForm({
  player,
  onClose,
  onSave,
}: {
  player?: Player;
  onClose: () => void;
  onSave: (name: string, player?: Player) => Promise<void>;
}) {
  const [name, setName] = useState(player?.name ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="modal" showCloseButton={false}>
        <DialogTitle>
          {player ? "Muokkaa pelaajaa" : "Lisää pelaaja"}
        </DialogTitle>
        <DialogDescription>
          Käytä etunimeä tai kutsumanimeä, jonka joukkue tunnistaa.
        </DialogDescription>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            setBusy(true);
            setError("");
            try {
              await onSave(name.trim(), player);
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Pelaajan nimi
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              required
              disabled={busy}
            />
          </label>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <DialogClose asChild>
              <button type="button" disabled={busy}>
                Peruuta
              </button>
            </DialogClose>
            <button className="primary" disabled={busy}>
              {busy ? "Tallennetaan…" : "Tallenna pelaaja"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
