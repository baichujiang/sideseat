import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { formatInTimeZone } from "date-fns-tz";
import { completeSmartInputDrafts, smartInputInstant, SMART_INPUT_POLICY } from "../../lib/calendar/smart-input-policy";
import { calendarEventSchema } from "../../lib/validators/calendar";
import { batchCalendarEventsSchema } from "../../lib/validators/calendar-natural";

const normal = "2026-10-03T14:12:00+02:00";
const early = "2026-10-04T00:30:00+02:00";
function complete(text: string, reference = normal, extracted?: unknown) {
  const result = completeSmartInputDrafts({ text, referenceTime: new Date(reference), categories: [], extracted });
  assert(batchCalendarEventsSchema.safeParse({ events: result.events }).success, JSON.stringify(result));
  assert.deepEqual(result.warnings, []);
  return result.events;
}
function times(text: string, reference = normal, extracted?: unknown) {
  return complete(text, reference, extracted).map((event) => [event.startAt, event.endAt].map((time) => formatInTimeZone(time, SMART_INPUT_POLICY.timeZone, "MM-dd HH:mm")));
}

const examples = [
  ["EX-01", "明天上午10:00取充电线", "10-04 10:00", "10-04 10:15"],
  ["EX-02", "明天取充电线", "10-04 09:00", "10-04 09:15"],
  ["EX-03", "取充电线", "10-03 14:30", "10-03 14:45"],
  ["EX-04", "明天10点办事", "10-04 10:00", "10-04 10:30"],
  ["EX-05", "明天学习两小时", "10-04 09:00", "10-04 11:00"],
  ["EX-06", "明天11点结束开会", "10-04 10:00", "10-04 11:00"],
  ["EX-07", "明天10点取充电线，留半小时", "10-04 10:00", "10-04 10:30"],
  ["EX-08", "今天23:50办事", "10-03 23:50", "10-04 00:20"],
  ["EX-09", "今天晚上十点到凌晨一点学习", "10-03 22:00", "10-04 01:00"],
  ["EX-10", "每周三学习", "10-07 09:00", "10-07 10:00"],
  ["EX-12", "办事", "10-03 14:30", "10-03 15:00"],
];
for (const [id, text, start, end] of examples) {
  test(`${id}: deterministic completion: ${text}`, () => assert.deepEqual(times(text), [[start, end]]));
}

test("EX-11/SI-02: independent event completion; one malformed event cannot discard its neighbor", () => {
  const text = "明天10点取充电线；下午3点开会一小时";
  const expected = [["10-04 10:00", "10-04 10:15"], ["10-03 15:00", "10-03 16:00"]];
  assert.deepEqual(times(text), expected);
  assert.deepEqual(times(text, normal, { events: [null, { source: "下午3点开会一小时", endTime: 123 }] }), expected);
});

const earlyExamples = [
  ["EX-14", "明天上午10点取充电线", "10-04 10:00", "10-04 10:15"],
  ["EX-15", "明天下午3点开会", "10-04 15:00", "10-04 16:00"],
  ["EX-16", "明早取充电线", "10-04 09:00", "10-04 09:15"],
  ["EX-17", "明天，也就是10月5日，上午10点取充电线", "10-05 10:00", "10-05 10:15"],
  ["EX-18", "不是今天，是明天上午10点取充电线", "10-05 10:00", "10-05 10:15"],
  ["EX-19", "24小时以后提醒我办事", "10-05 00:30", "10-05 01:00"],
  ["EX-23", "明天晚上7点开会", "10-05 19:00", "10-05 20:00"],
  ["EX-24", "明天周一上午10点取充电线", "10-05 10:00", "10-05 10:15"],
];
for (const [id, text, start, end] of earlyExamples) {
  test(`${id}/SI-09: ${text}`, () => assert.deepEqual(times(text, early), [[start, end]]));
}
for (const [id, clock, date] of [["EX-20", "00:00", "10-04"], ["EX-21", "03:59", "10-04"], ["EX-22", "04:00", "10-05"]]) {
  test(`${id}: early-morning boundary ${clock}`, () => {
    assert.deepEqual(times("明天上午10点取充电线", `2026-10-04T${clock}:00+02:00`), [[`${date} 10:00`, `${date} 10:15`]]);
  });
}

test("SI-01/SI-04: explicit ranges/durations, end-only, same/backwards/malformed ends", () => {
  assert.deepEqual(times("24小时以后学习两小时", early), [["10-05 00:30", "10-05 02:30"]]);
  assert.deepEqual(times("明天10点到11点开会，留半小时"), [["10-04 10:00", "10-04 11:00"]]);
  assert.deepEqual(times("明天10点到10点办事"), [["10-04 10:00", "10-04 10:30"]]);
  assert.deepEqual(times("明天10点到9点办事"), [["10-04 10:00", "10-04 10:30"]]);
  assert.deepEqual(times("明天11点结束办事，半小时"), [["10-04 10:30", "10-04 11:00"]]);
  for (const endTime of [undefined, null, "", "unknown", { text: "取充电线", value: "25:99" }]) {
    assert.deepEqual(times("明天上午10:00取充电线", normal, { events: [{ endTime }] }), [["10-04 10:00", "10-04 10:15"]]);
  }
});

test("SI-01/SI-05: date-only, clock-only, daypart, past dates and strictly next half-hour", () => {
  for (const [text, start] of [["今天办事", "10-03 14:30"], ["昨天办事", "10-02 09:00"], ["10点办事", "10-04 10:00"], ["15点办事", "10-03 15:00"], ["明天下午办事", "10-04 14:00"], ["今天上午办事", "10-03 09:00"], ["下午办事", "10-04 14:00"], ["明天99:99办事", "10-04 09:00"]]) {
    assert.equal(times(text)[0][0], start, text);
  }
  assert.equal(times("今天办事", "2026-10-03T08:00:00+02:00")[0][0], "10-03 09:00");
  assert.equal(times("办事", "2026-10-03T14:30:00+02:00")[0][0], "10-03 15:00");
  assert.equal(times("办事", "2026-10-03T23:50:00+02:00")[0][0], "10-04 00:00");
});

test("SI-09: per-event rule does not shift explicit dates, other phrases or languages", () => {
  assert.deepEqual(times("明天上午10点取充电线；明天晚上7点开会；后天下午3点办事", early), [["10-04 10:00", "10-04 10:15"], ["10-05 19:00", "10-05 20:00"], ["10-06 15:00", "10-06 15:30"]]);
  assert.equal(times("tomorrow morning 10:00 pick up cable", early)[0][0], "10-05 10:00");
  assert.equal(times("明天上午10点办事", "2026-12-31T00:30:00+01:00")[0][0], "12-31 10:00");
  assert.equal(times("明天上午10点办事", "2026-12-31T04:00:00+01:00")[0][0], "01-01 10:00");
});

test("SI-05: Berlin DST gaps, overlap, calendar-day arithmetic and elapsed duration", () => {
  assert.equal(smartInputInstant("2026-03-29", "02:30").toISOString(), "2026-03-29T01:30:00.000Z");
  assert.equal(smartInputInstant("2026-10-25", "02:30").toISOString(), "2026-10-25T00:30:00.000Z");
  const spring = complete("明天10点开会", "2026-03-28T12:00:00+01:00")[0];
  assert.equal(spring.startAt, "2026-03-29T08:00:00.000Z");
  const autumn = complete("今天凌晨两点半开会", "2026-10-25T00:30:00+02:00")[0];
  assert.equal(Date.parse(autumn.endAt) - Date.parse(autumn.startAt), 3_600_000);
});

test("SI-01/SI-07: model only supplies evidenced facts, independent of calendar category", () => {
  const text = "On October 8 at 10 meet Alex at Main Library for 45 minutes";
  const event = complete(text, normal, { events: [{
    source: text, title: "Meet Alex", date: { text: "October 8", value: "2026-10-08" },
    startTime: { text: "at 10", value: "10:00" }, duration: { text: "45 minutes", value: 45 },
    location: { text: "Main Library", value: "Main Library" }, note: { text: "secret", value: "invented" },
    eventType: "meeting", categoryPreset: "work", endTime: { text: "11am", value: "11:00" },
  }] })[0];
  assert.equal(event.startAt, "2026-10-08T08:00:00.000Z");
  assert.equal(event.endAt, "2026-10-08T08:45:00.000Z");
  assert.equal(event.location, "Main Library");
  assert.equal(event.note, "");
  assert.equal(event.categoryId, null);
  assert.deepEqual(times("明天10点办事", normal, { events: [{ categoryPreset: "study" }] }), [["10-04 10:00", "10-04 10:30"]]);
  // Live Qwen candidate regression: generic errands received 15m; broad types must not override 30m.
  assert.deepEqual(times("明天10点办事", normal, { events: [{ eventType: "short_errand" }] }), [["10-04 10:00", "10-04 10:30"]]);
  assert.deepEqual(times("明天10点开会", normal, { events: [{ eventType: "short_errand" }] }), [["10-04 10:00", "10-04 11:00"]]);
});

test("SI-02/SI-08: unusable/oversized output retains input; recurrence without an end is valid", () => {
  for (const extracted of [null, [], { events: [] }, { events: Array(11).fill({}) }, { events: [false] }]) {
    assert.equal(complete("办事", normal, extracted)[0].title, "办事");
  }
  assert.equal(complete("每周三学习")[0].repeat, "WEEKLY");
  assert.equal(complete("每周三学习")[0].repeatUntil, "");
  assert.equal(complete("每周学习")[0].repeat, "WEEKLY");
  assert.equal(complete("隔几天学习")[0].repeat, "NONE");
});

test("SI-01: recurrence end is not the first event date; unsupported details stay empty", () => {
  const source = "每周三学习，直到10月30日";
  const event = complete(source, normal, { events: [{
    source, repeatUntil: { text: "10月30日", value: "2026-10-30" },
    location: { text: "学习", value: "Invented library" },
  }] })[0];
  assert.equal(event.startAt, "2026-10-07T07:00:00.000Z");
  assert.equal(event.repeatUntil, "2026-10-30T22:59:00.000Z");
  assert.equal(event.location, "");
  const title = complete("a" + "📅".repeat(100))[0].title;
  assert(title.length <= 120);
  assert.equal(title, "a" + "📅".repeat(59));
});

test("EX-13/SI-06: edited drafts save as provided; strict save validation still rejects invalid ends", () => {
  const draft = complete("明天上午10:00取充电线")[0];
  const edited = { ...draft, endAt: "2026-10-04T10:20:00+02:00" };
  const batch = batchCalendarEventsSchema.parse({ events: [edited] });
  assert.equal(batch.events[0].endAt, edited.endAt);
  assert.equal(calendarEventSchema.safeParse({ ...draft, endAt: "11:00" }).success, false);
});

test("SI-08: real parser boundary completes malformed JSON, provider outage and unconfigured provider", async (t) => {
  const resolver = Module as typeof Module & { _resolveFilename: (request: string, ...args: unknown[]) => string };
  const original = resolver._resolveFilename;
  resolver._resolveFilename = function (request, ...args) {
    return request === "server-only" ? fileURLToPath(new URL("../v2/server-only-test-stub.cjs", import.meta.url)) : original.call(this, request, ...args);
  };
  t.after(() => { resolver._resolveFilename = original; });
  const { parseNaturalLanguageSchedule } = await import("../../lib/calendar/parse-natural-language");
  const key = process.env.DASHSCOPE_API_KEY;
  t.after(() => { if (key === undefined) delete process.env.DASHSCOPE_API_KEY; else process.env.DASHSCOPE_API_KEY = key; });
  process.env.DASHSCOPE_API_KEY = "test-only";
  let body = "not JSON";
  let fail = false;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    assert.equal(request.messages[1].content, "明天上午10:00取充电线");
    assert.match(request.messages[0].content, /Do NOT fill missing/);
    if (fail) throw new Error("provider unavailable");
    return Response.json({ choices: [{ message: { content: body } }] });
  });
  for (const mode of ["bad-json", "bad-fields", "outage", "unconfigured"]) {
    body = JSON.stringify({ events: [{ title: "取充电线", endAt: "11:00" }] });
    if (mode === "bad-json") body = "not JSON";
    if (mode === "outage") fail = true;
    if (mode === "unconfigured") delete process.env.DASHSCOPE_API_KEY;
    const result = await parseNaturalLanguageSchedule({ text: "明天上午10:00取充电线", locale: "zh-CN", referenceTime: new Date(normal), categories: [] });
    assert.equal(result.data.events[0].endAt, "2026-10-04T08:15:00.000Z", mode);
    assert.deepEqual(result.data.warnings, []);
  }
});
