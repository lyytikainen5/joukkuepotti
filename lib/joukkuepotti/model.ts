export type Team = {
  id: string;
  name: string;
  owner_id: string;
};
export type Player = {
  id: string;
  team_id: string;
  name: string;
  active: boolean;
};
export type Share = {
  player_id: string;
  amount_cents: number;
};
export type Expense = {
  id: string;
  team_id: string;
  title: string;
  amount_cents: number;
  date: string;
  revision: number;
  shares: Share[];
};
export type Snapshot = {
  team: Team | null;
  players: Player[];
  expenses: Expense[];
};
export type ExpenseDraft = {
  id?: string;
  title: string;
  amount_cents: number;
  date: string;
  participant_ids: string[];
  expected_revision?: number;
};
export function parseAmount(input: string): number | null {
  const value = input.trim().replace(",", ".");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 100000000
    ? cents
    : null;
}
export function divideExpense(amount: number, ids: string[]): Share[] {
  if (
    !Number.isSafeInteger(amount) ||
    amount < 1 ||
    amount > 100000000 ||
    !ids.length ||
    ids.length > 500 ||
    new Set(ids).size !== ids.length
  )
    throw new Error("Virheellinen kulunjako.");
  const base = Math.floor(amount / ids.length),
    remainder = amount % ids.length;
  return ids.map((player_id, index) => ({
    player_id,
    amount_cents: base + (index < remainder ? 1 : 0),
  }));
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function playerTotals(snapshot: Snapshot): Record<string, number> {
  const totals: Record<string, number> = Object.fromEntries(
    snapshot.players.map((p) => [p.id, 0]),
  );
  for (const e of snapshot.expenses)
    for (const share of e.shares)
      totals[share.player_id] =
        (totals[share.player_id] || 0) + share.amount_cents;
  return totals;
}
export const money = (cents: number) =>
  new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function demoSnapshot(): Snapshot {
  const team = { id: "demo", name: "FC Kaverit", owner_id: "demo" };
  const players = [
    "Lassi",
    "Mikko",
    "Joonas",
    "Eetu",
    "Antti",
    "Sami",
    "Ville",
    "Oskari",
  ].map((name, i) => ({ id: `p${i}`, team_id: team.id, name, active: true }));
  const expenses = [
    {
      id: "e1",
      title: "Tiistain kenttävuoro",
      amount_cents: 9000,
      date: "2026-09-08",
      ids: players.map((p) => p.id),
    },
    {
      id: "e2",
      title: "Harjoitusliivit",
      amount_cents: 6400,
      date: "2026-09-06",
      ids: players.map((p) => p.id),
    },
    {
      id: "e3",
      title: "Sunnuntain hallivuoro",
      amount_cents: 7500,
      date: "2026-09-06",
      ids: players.slice(0, 6).map((p) => p.id),
    },
  ].map(({ ids, ...e }) => ({
    ...e,
    team_id: team.id,
    revision: 1,
    shares: divideExpense(e.amount_cents, ids),
  }));
  return { team, players, expenses };
}
