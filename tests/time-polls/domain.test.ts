import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPollSlots, createTimePollSchema, summarizePoll } from "../../lib/time-polls/domain";

const input = createTimePollSchema.parse({ title: "Dinner", timeZone: "Europe/Berlin", dates: ["2026-10-16"], startMinute: 540, endMinute: 1020 });
const slots = buildPollSlots(input);
const people = Array.from({ length: 5 }, (_, index) => ({ id: String(index), displayName: `Person ${index + 1}`, isMe: index === 0, slotIds: [0, 1, 2, 3, ...Array.from({ length: 4 }, (_, quarter) => 4 + index * 4 + quarter)] }));

test("five people share an hour; removing one response recommends the four-person hour", () => {
  assert.equal(slots.length, 32);
  assert.equal(slots[0].start, "2026-10-16T07:00:00.000Z");
  const shared = summarizePoll(slots, people);
  assert.equal(shared.common, true); assert.equal(shared.maximum, 5);
  assert.equal(shared.windows.length, 1); assert.equal(shared.windows[0].end, slots[3].end);
  const best = summarizePoll(slots, people.map((person, index) => index === 4 ? { ...person, slotIds: person.slotIds.filter((id) => id >= 4) } : person));
  assert.equal(best.common, false); assert.equal(best.maximum, 4); assert.equal(best.participantCount, 5);
  assert.deepEqual(best.windows[0].attendeeIds, ["0", "1", "2", "3"]);
});

test("a person with no available time still counts as a participant", () => {
  const result = summarizePoll(slots, [{ ...people[0], slotIds: [0] }, { ...people[1], slotIds: [] }]);
  assert.equal(result.common, false); assert.equal(result.participantCount, 2);
});

test("equal attendance with different people is not merged into a false whole window", () => {
  const result = summarizePoll(slots, [{ ...people[0], slotIds: [0] }, { ...people[1], slotIds: [1] }]);
  assert.equal(result.windows.length, 2);
  assert.notDeepEqual(result.windows[0].attendeeIds, result.windows[1].attendeeIds);
});

test("DST repeated hour has distinct cells and actual UTC intervals", () => {
  const repeated = buildPollSlots({ ...input, dates: ["2026-10-25"], startMinute: 0, endMinute: 240 });
  assert.equal(repeated.length, 20);
  assert.equal(new Set(repeated.map((slot) => slot.row)).size, 20);
  for (let i = 1; i < repeated.length; i++) assert.equal(repeated[i - 1].end, repeated[i].start);
});

test("recommendations cover the entire activity duration and keep unfilled invitees visible", () => {
  const slots = buildPollSlots({ title: "Dinner", timeZone: "Europe/Berlin", dates: ["2026-10-16"], startMinute: 540, endMinute: 660 });
  const people = Array.from({ length: 5 }, (_, n) => ({ id: String(n), displayName: String(n), isMe: n === 0, slotIds: n === 4 ? [0, 1] : [0, 1, 2, 3] }));
  const fullHour = summarizePoll(slots, people, 60, 5);
  assert.equal(fullHour.maximum, 4);
  assert.equal(fullHour.common, false);
  assert.equal(fullHour.windows[0].end, slots[3].end);
  assert.deepEqual(fullHour.windows[0].attendeeIds, ["0", "1", "2", "3"]);
  const waiting = summarizePoll(slots, people.slice(0, 3), 60, 5);
  assert.equal(waiting.maximum, 3);
  assert.equal(waiting.common, false);
});
