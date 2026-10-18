import assert from "node:assert/strict";
import test from "node:test";
import { invitationTimetableRows } from "../../lib/time-polls/browser-types";

test("invitation timetable focuses the actual final time, including fixed hours outside the collection grid", () => {
  const rows = invitationTimetableRows("2030-10-20T20:00:00Z", "2030-10-20T21:00:00Z", "Europe/Berlin");
  assert.deepEqual(rows.map(r => r.label), ["21:30", "22:00", "22:30", "23:00"]);
  assert.deepEqual(rows.map(r => r.through > r.from), [false, true, true, false]);
});
test("legacy quarter-hour edges highlight only the invited part of the boundary cells", () => {
  const rows = invitationTimetableRows("2030-10-20T07:15:00Z", "2030-10-20T08:15:00Z", "Europe/Berlin").filter(r => r.through > r.from);
  assert.equal(rows.length, 3); assert.equal(rows[0].label, "09:00"); assert.equal(rows[0].from, 0.5); assert.equal(rows[0].through, 1);
  assert.equal(rows[2].label, "10:00"); assert.equal(rows[2].from, 0); assert.equal(rows[2].through, 0.5);
});
test("midnight dates and repeated DST labels retain their actual order", () => {
  const cross = invitationTimetableRows("2030-10-20T21:45:00Z", "2030-10-20T22:15:00Z", "Europe/Berlin");
  assert.deepEqual([...new Set(cross.filter(r => r.through > r.from).map(r => r.date))], ["2030-10-20", "2030-10-21"]);
  const fall = invitationTimetableRows("2026-10-25T00:30:00Z", "2026-10-25T02:30:00Z", "Europe/Berlin");
  assert.equal(fall.filter(r => r.through > r.from).length, 4); assert(fall.some(r => r.label === "02:30 +01:00"));
});
