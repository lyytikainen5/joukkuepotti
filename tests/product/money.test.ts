import test from "node:test";
import assert from "node:assert/strict";
import {
  divideExpense,
  parseAmount,
  playerTotals,
  demoSnapshot,
  validDate,
} from "../../lib/joukkuepotti/model";
test("every cent is allocated once, even for more players than cents", () => {
  for (const amount of [1, 2, 99, 100, 9000, 100000000])
    for (let count = 1; count <= 100; count++) {
      const shares = divideExpense(
        amount,
        Array.from({ length: count }, (_, i) => String(i)),
      );
      assert.equal(
        shares.reduce((s, p) => s + p.amount_cents, 0),
        amount,
      );
      assert.ok(
        Math.max(...shares.map((s) => s.amount_cents)) -
          Math.min(...shares.map((s) => s.amount_cents)) <=
          1,
      );
    }
});
test("invalid input never silently rounds or double charges a player", () => {
  for (const v of [
    "-1",
    "0",
    "1.001",
    "1,23,4",
    "Infinity",
    "1e4",
    "1000000.01",
    "",
  ])
    assert.equal(parseAmount(v), null);
  assert.equal(parseAmount("12,50"), 1250);
  assert.equal(parseAmount("12.5"), 1250);
  assert.equal(parseAmount(" 0,01 "), 1);
  assert.throws(() => divideExpense(100, []));
  assert.throws(() => divideExpense(100, ["p", "p"]));
  assert.throws(() => divideExpense(1.5, ["p"]));
});
test("invalid calendar dates are rejected", () => {
  assert.equal(validDate("2026-02-29"), false);
  assert.equal(validDate("2028-02-29"), true);
  assert.equal(validDate("2026-13-01"), false);
});
test("archiving retains historical totals; deleting removes only the selected expense", () => {
  const s = demoSnapshot();
  const before = playerTotals(s);
  s.players[0].active = false;
  assert.deepEqual(playerTotals(s), before);
  const removed = s.expenses.pop()!;
  const after = playerTotals(s);
  for (const p of s.players)
    assert.equal(
      after[p.id],
      before[p.id] -
        (removed.shares.find((x) => x.player_id === p.id)?.amount_cents ?? 0),
    );
});
