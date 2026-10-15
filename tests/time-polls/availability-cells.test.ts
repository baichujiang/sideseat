import assert from "node:assert/strict";
import { test } from "node:test";
import { availabilityCells } from "../../lib/time-polls/browser-types";
import { buildPollSlots } from "../../lib/time-polls/domain";

test("half-hour cells keep every persisted quarter ID and legacy boundary", () => {
  const slots = buildPollSlots({ title: "Study", timeZone: "Europe/Berlin", dates: ["2026-10-20", "2026-10-21"], startMinute: 555, endMinute: 660 });
  const cells = availabilityCells(slots);
  assert.equal(cells.length, 8);
  assert.deepEqual(cells.flatMap((cell) => cell.slotIds), slots.map((slot) => slot.id));
  assert.deepEqual(cells.map((cell) => cell.label), ["09:15", "09:45", "10:15", "10:45", "09:15", "09:45", "10:15", "10:45"]);
  assert.equal(new Date(cells[0].end).getTime() - new Date(cells[0].start).getTime(), 30 * 60000);
  assert.deepEqual(cells[3].slotIds, [6]);
  assert.deepEqual(cells[4].slotIds, [7, 8]);
});

test("a full-day grid is half as tall and repeated DST times remain separate", () => {
  for (const date of ["2026-03-29", "2026-10-25", "2026-10-26"]) {
    const slots = buildPollSlots({ title: "Study", timeZone: "Europe/Berlin", dates: [date], startMinute: 0, endMinute: 1440 });
    const cells = availabilityCells(slots);
    assert.equal(cells.length, slots.length / 2);
    assert.equal(new Set(cells.map((cell) => cell.row)).size, cells.length);
    assert(cells.every((cell) => new Date(cell.end).getTime() - new Date(cell.start).getTime() === 30 * 60000));
    assert.deepEqual(cells.flatMap((cell) => cell.slotIds), slots.map((slot) => slot.id));
  }
});
