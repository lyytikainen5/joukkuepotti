import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ExpenseDraft, Snapshot } from "./model";
let client: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key);
  return client;
}
export async function loadSnapshot(db: SupabaseClient): Promise<Snapshot> {
  const { data: team, error } = await db
    .from("teams")
    .select("id,name,owner_id")
    .maybeSingle();
  if (error) throw error;
  if (!team) return { team: null, players: [], expenses: [] };
  const [p, e] = await Promise.all([
    db
      .from("players")
      .select("id,team_id,name,active")
      .eq("team_id", team.id)
      .order("created_at")
      .order("id"),
    db
      .from("expenses")
      .select(
        "id,team_id,title,amount_cents,date,revision,shares:expense_shares(player_id,amount_cents)",
      )
      .eq("team_id", team.id)
      .order("date", { ascending: false })
      .order("id"),
  ]);
  if (p.error) throw p.error;
  if (e.error) throw e.error;
  return { team, players: p.data ?? [], expenses: e.data ?? [] };
}
export async function saveExpense(
  db: SupabaseClient,
  teamId: string,
  draft: ExpenseDraft,
) {
  const { error } = await db.rpc("save_expense", {
    p_team_id: teamId,
    p_id: draft.id ?? crypto.randomUUID(),
    p_title: draft.title,
    p_amount: draft.amount_cents,
    p_date: draft.date,
    p_participants: draft.participant_ids,
    p_expected_revision: draft.expected_revision ?? 0,
  });
  if (error) throw error;
}
export function errorMessage(error: unknown): string {
  const e = error as {
    message?: string;
    code?: string;
  };
  if (e.message?.includes("conflict"))
    return "Kulu on muuttunut toisessa ikkunassa. Päivitä tiedot ja avaa kulu uudelleen.";
  if (e.code === "23505") return "Tämä nimi tai joukkue on jo käytössä.";
  if (e.message?.includes("participants"))
    return "Valitse joukkueeseen kuuluvat osallistujat.";
  if (e.message?.includes("Failed to fetch") || e.message?.includes("Network"))
    return "Yhteys katkesi. Tarkista verkkoyhteys ja yritä uudelleen.";
  return "Toiminto ei onnistunut. Tarkista yhteys ja yritä uudelleen. Syöttämäsi tiedot ovat edelleen lomakkeella.";
}
