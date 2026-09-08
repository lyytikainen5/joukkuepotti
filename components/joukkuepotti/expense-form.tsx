"use client";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import {
  divideExpense,
  money,
  parseAmount,
  today,
  validDate,
  type Expense,
  type ExpenseDraft,
  type Player,
} from "@/lib/joukkuepotti/model";
export function ExpenseForm({
  players,
  expense,
  onClose,
  onSave,
}: {
  players: Player[];
  expense?: Expense;
  onClose: () => void;
  onSave: (draft: ExpenseDraft) => Promise<void>;
}) {
  const [title, setTitle] = useState(expense?.title ?? "");
  const [amount, setAmount] = useState(
    expense ? (expense.amount_cents / 100).toFixed(2).replace(".", ",") : "",
  );
  const [date, setDate] = useState(expense?.date ?? today());
  const available = players.filter(
    (p) => p.active || expense?.shares.some((s) => s.player_id === p.id),
  );
  const [ids, setIds] = useState(
    expense
      ? expense.shares.map((s) => s.player_id)
      : available.map((p) => p.id),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const cents = parseAmount(amount);
  const shares =
    cents && ids.length && ids.length <= 500 ? divideExpense(cents, ids) : [];
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (
      !title.trim() ||
      !cents ||
      !validDate(date) ||
      !ids.length ||
      ids.length > 500
    ) {
      setError(
        "Anna kulun nimi, positiivinen summa, päivämäärä ja 1–500 osallistujaa.",
      );
      return;
    }
    setBusy(true);
    try {
      await onSave({
        id: expense?.id,
        title: title.trim(),
        amount_cents: cents,
        date,
        participant_ids: available
          .filter((p) => ids.includes(p.id))
          .map((p) => p.id),
        expected_revision: expense?.revision,
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="modal"
        showCloseButton={false}
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <DialogTitle>
          {expense ? "Muokkaa kulua" : "Lisää yhteinen kulu"}
        </DialogTitle>
        <DialogDescription>
          Kulu jaetaan tasan valittujen osallistujien kesken.
        </DialogDescription>
        <form onSubmit={submit}>
          <label>
            Kulun nimi
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={80}
              placeholder="Esim. tiistain kenttävuoro"
              disabled={busy}
            />
          </label>
          <div className="formrow">
            <label>
              Summa (€)
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                inputMode="decimal"
                placeholder="90,00"
                disabled={busy}
              />
            </label>
            <label>
              Päivämäärä
              <input
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                type="date"
                disabled={busy}
              />
            </label>
          </div>
          <div className="selectionhead">
            <strong>Osallistujat ({ids.length})</strong>
            <button
              type="button"
              className="textbtn"
              disabled={busy}
              onClick={() =>
                setIds(
                  ids.length === available.length
                    ? []
                    : available.map((p) => p.id),
                )
              }
            >
              {ids.length === available.length
                ? "Poista valinnat"
                : "Valitse kaikki"}
            </button>
          </div>
          <div className="checkgrid">
            {available.map((p) => (
              <label className="checkrow" key={p.id}>
                <Checkbox
                  checked={ids.includes(p.id)}
                  disabled={busy}
                  onCheckedChange={(checked) =>
                    setIds((current) =>
                      checked
                        ? [...current, p.id]
                        : current.filter((id) => id !== p.id),
                    )
                  }
                />
                <span>
                  {p.name}
                  {!p.active ? " (arkistoitu)" : ""}
                </span>
              </label>
            ))}
          </div>
          <div className="preview" aria-live="polite">
            {shares.length ? (
              <>
                <strong>
                  {money(cents!)} / {ids.length} pelaajaa
                </strong>
                <div>
                  {money(Math.min(...shares.map((s) => s.amount_cents)))}
                  {cents! % ids.length
                    ? "–" +
                      money(Math.max(...shares.map((s) => s.amount_cents)))
                    : ""}{" "}
                  / pelaaja
                </div>
                {cents! % ids.length !== 0 && (
                  <p className="smallhelp">
                    Ylijäävät sentit jaetaan osallistujalistan järjestyksessä.
                  </p>
                )}
              </>
            ) : ids.length ? (
              "Lisää summa nähdäksesi pelaajien osuudet."
            ) : (
              "Valitse 1–500 osallistujaa."
            )}
          </div>
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
            <button className="primary" disabled={busy} type="submit">
              {busy ? "Tallennetaan…" : "Tallenna kulu"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
