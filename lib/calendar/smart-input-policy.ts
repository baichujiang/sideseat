import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

// This same resource is bundled in the native app for SI-08's offline draft.
import policy from "./CalendarSmartInputPolicy.json";
import { resolveCategoryFromPreset, type UserCategoryForMapping } from "./category-preset";
import {
  llmParsedEventSchema,
  type ExtractedScheduleEvent,
  type ParsedScheduleDraft,
  type ParseNaturalScheduleResult,
} from "./natural-language-schema";

export const SMART_INPUT_POLICY = policy;
const minute = 60_000;
const maximumDateMs = 8_640_000_000_000_000;
function truncateText(text: string, limit: number): string {
  let result = "";
  for (const character of text) {
    if (result.length + character.length > limit) break;
    result += character;
  }
  return result;
}
const day = 86_400_000;
const dateKey = (date: Date) => formatInTimeZone(date, policy.timeZone, "yyyy-MM-dd");
const shiftDate = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * day).toISOString().slice(0, 10);

function validDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

function validClock(value: string | null | undefined): string | null {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return null;
  const [hour, minutes] = value.split(":").map(Number);
  return hour < 24 && minutes < 60 ? `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}` : null;
}

/** Wall time -> instant, independent of the server timezone. On the spring gap,
 * move forward by the gap; on the autumn overlap, consistently use the first occurrence. */
export function smartInputInstant(date: string, clock: string): Date {
  const wall = `${date}T${clock}:00`;
  let result = fromZonedTime(wall, policy.timeZone);
  const rendered = formatInTimeZone(result, policy.timeZone, "yyyy-MM-dd'T'HH:mm:ss");
  if (rendered < wall) result = new Date(+result + (Date.parse(`${wall}Z`) - Date.parse(`${rendered}Z`)));
  const previous = new Date(+result - 60 * minute);
  if (formatInTimeZone(previous, policy.timeZone, "yyyy-MM-dd'T'HH:mm:ss") === wall) result = previous;
  return result;
}

export function nextSmartInputBoundary(reference: Date): Date {
  // Advance on the instant timeline, checking Berlin wall minutes. This also
  // handles skipped/repeated hours without depending on the host's timezone.
  let result = new Date(Math.floor(+reference / minute) * minute + minute);
  while (Number(formatInTimeZone(result, policy.timeZone, "m")) % policy.roundingMinutes !== 0) {
    result = new Date(+result + minute);
  }
  return result;
}

function evidence<T>(fact: { text: string; value: T } | null | undefined, source: string): T | null {
  return fact && source.includes(fact.text) ? fact.value : null;
}

function numberInText(text: string): number {
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if (text === "半") return 0.5;
  const digits: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (text.includes("十")) {
    const [tens, units] = text.split("十");
    return (tens ? digits[tens] : 1) * 10 + (units ? digits[units] : 0);
  }
  return digits[text] ?? NaN;
}

function dayPart(source: string): "morning" | "noon" | "afternoon" | "evening" | null {
  if (/下午|afternoon/i.test(source)) return "afternoon";
  if (/晚上|傍晚|今晚|evening|tonight/i.test(source)) return "evening";
  if (/中午|noon/i.test(source)) return "noon";
  if (/上午|早上|明早|morning/i.test(source)) return "morning";
  return null;
}

function defaultClock(part: ReturnType<typeof dayPart>): string {
  const hour = part === "afternoon" ? policy.afternoonHour : part === "evening" ? policy.eveningHour
    : part === "noon" ? policy.noonHour : policy.morningHour;
  return `${String(hour).padStart(2, "0")}:00`;
}

function localDate(source: string, reference: Date): string | null {
  const today = dateKey(reference);
  const year = today.slice(0, 4);
  // Explicit calendar dates and weekdays outrank colloquial relative words.
  const iso = source.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return validDate(iso[1]);
  const chinese = source.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})[日号]?/);
  if (chinese) return validDate(`${chinese[1] ?? year}-${chinese[2].padStart(2, "0")}-${chinese[3].padStart(2, "0")}`);
  const weekday = source.match(/(下下|下|本|这|每)?(?:周|星期)([一二三四五六日天])/);
  const english = source.match(/\b(?:(next|this|every)\s+)?(mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i);
  if (weekday || english) {
    const target = weekday ? Math.min("一二三四五六日天".indexOf(weekday[2]), 6) + 1
      : ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].indexOf(english![2].toLowerCase().slice(0, 3)) + 1;
    const current = Number(formatInTimeZone(reference, policy.timeZone, "i"));
    const qualifier = weekday?.[1] ?? english?.[1]?.toLowerCase();
    const offset = qualifier === "下下" ? 14 : qualifier === "下" || qualifier === "next" ? 7 : qualifier === "本" || qualifier === "这" || qualifier === "this" ? 0 : null;
    return shiftDate(today, offset === null ? (target - current + 7) % 7 : target - current + offset);
  }
  if (/后天|day after tomorrow/i.test(source)) return shiftDate(today, 2);
  if (/昨天|yesterday/i.test(source)) return shiftDate(today, -1);
  if (/明天|明早|tomorrow/i.test(source)) {
    const early = Number(formatInTimeZone(reference, policy.timeZone, "H")) < policy.colloquialTomorrowBeforeHour;
    const colloquial = /明早|明天\s*(?:上午|下午)/.test(source);
    const explicitTomorrow = /不是今天[，,\s]*是明天|明天而不是今天/.test(source);
    return shiftDate(today, early && colloquial && !explicitTomorrow ? 0 : 1);
  }
  if (/今天|今晚|today|tonight/i.test(source)) return today;
  return null;
}

type ClockMatch = { clock: string | null; index: number; end: number };
function localClocks(source: string): ClockMatch[] {
  const pattern = /(?:(凌晨|早上|上午|中午|下午|晚上|傍晚)\s*)?(?:(\d{1,2})[:：](\d{2})|(\d{1,2}|[零一二两三四五六七八九十]{1,3})[点时](?:(半)|(\d{1,2}|[零一二两三四五六七八九十]{1,3})分?)?)(?:\s*(am|pm))?|\b(\d{1,2})(?:\s*(am|pm)|(?=\s*o'clock))/gi;
  const result: ClockMatch[] = [];
  for (const match of source.matchAll(pattern)) {
    let hour = numberInText(match[2] ?? match[4] ?? match[8]);
    const minutes = match[3] ? Number(match[3]) : match[5] ? 30 : match[6] ? numberInText(match[6]) : 0;
    const part = match[1] ? dayPart(match[1]) : dayPart(source.slice(0, match.index));
    const ampm = (match[7] ?? match[9])?.toLowerCase();
    if ((ampm === "pm" || (!ampm && (part === "afternoon" || part === "evening" || part === "noon"))) && hour < 12 && match[1] !== "凌晨") hour += 12;
    if ((ampm === "am" || match[1] === "凌晨") && hour === 12) hour = 0;
    result.push({ clock: validClock(`${hour}:${String(minutes).padStart(2, "0")}`), index: match.index, end: match.index + match[0].length });
  }
  return result;
}

function localDuration(source: string): number | null {
  const hours = source.match(/(\d+(?:\.\d+)?|[一二两三四五六七八九十]{1,3}|半)(?:个)?(?:小时|\s*hours?\b|\s*hrs?\b)(半)?/i);
  if (hours) return (numberInText(hours[1]) + (hours[2] ? 0.5 : 0)) * 60;
  const minutes = source.match(/(\d+|[一二两三四五六七八九十]{1,3})(?:分钟|\s*minutes?\b|\s*mins?\b)/i);
  return minutes ? numberInText(minutes[1]) : null;
}

export function defaultSmartInputMinutes(source: string, eventType = "other"): number {
  // Explicitly recognized meaning outranks the model's broad classification.
  // Live Qwen QA returned 15m for generic "办事"; SI-04 requires 30m.
  if (new RegExp(policy.shortErrandPattern, "i").test(source)) return policy.shortErrandMinutes;
  if (new RegExp(policy.activityPattern, "i").test(source)) return policy.activityMinutes;
  if (/办事|处理事情|\b(?:errands?|do something)\b/i.test(source)) return policy.defaultMinutes;
  if (eventType === "short_errand") return policy.shortErrandMinutes;
  if (["meal", "meeting", "study", "sport"].includes(eventType)) return policy.activityMinutes;
  return policy.defaultMinutes;
}

function completeEvent(raw: ExtractedScheduleEvent, source: string, reference: Date, categories: UserCategoryForMapping[]): ParsedScheduleDraft {
  const clocks = localClocks(source);
  const onlyEnd = clocks.length === 1 && (
    /结束|到期|截止|\b(?:ends?|finishes|until|by)\b/i.test(source)
    || (validClock(evidence(raw.endTime, source)) !== null && evidence(raw.startTime, source) === null)
  );
  const explicitRange = clocks.length > 1 && /到|至|[-–—~～]|\b(?:to|until)\b/i.test(source.slice(clocks[0].end, clocks[1].index));
  const startClock = onlyEnd ? null : clocks[0]?.clock ?? validClock(evidence(raw.startTime, source));
  const endClock = (onlyEnd ? clocks[0]?.clock : explicitRange ? clocks[1]?.clock : null) ?? validClock(evidence(raw.endTime, source));
  const recurrenceSource = /每周|每星期|每天|每月|每年|weekly|daily|monthly|yearly|every /i.test(source)
    ? source.split(/直到|持续到|截止到|截至|\buntil\b/i)[0] : source;
  const firstDateSource = explicitRange ? recurrenceSource.slice(0, clocks[0].end) : recurrenceSource;
  const date = localDate(firstDateSource, reference) ?? validDate(evidence(raw.date, source));
  const intervalText = source.match(/(?:\d+(?:\.\d+)?|[一二两三四五六七八九十]{1,3}|半)(?:个)?(?:小时|分钟|\s*hours?|\s*minutes?)\s*(?:以?后|later)|\bin\s+\d+\s*(?:hours?|minutes?)/i)?.[0];
  const interval = intervalText ? localDuration(intervalText) : null;
  const duration = localDuration(intervalText ? source.replace(intervalText, "") : source) ?? evidence(raw.duration, source);
  const durationMinutes = duration && Number.isFinite(duration) && duration > 0 && duration * minute < maximumDateMs - Math.abs(+reference)
    ? duration : defaultSmartInputMinutes(source, raw.eventType);
  const part = dayPart(source) ?? evidence(raw.dayPart, source);
  const today = dateKey(reference);
  const resolveClock = (clock: string, explicitDate: string | null): Date => {
    const result = smartInputInstant(explicitDate ?? today, clock);
    return !explicitDate && +result < +reference ? smartInputInstant(shiftDate(today, 1), clock) : result;
  };
  let start: Date;
  let end: Date;
  const endDate = validDate(evidence(raw.endDate, source))
    ?? (explicitRange ? localDate(source.slice(clocks[0].end), reference) : null);
  if (!startClock && endClock && !interval) {
    end = resolveClock(endClock, endDate ?? date);
    start = new Date(+end - durationMinutes * minute);
  } else {
    if (interval && Number.isFinite(interval) && interval > 0 && interval * minute < maximumDateMs - Math.abs(+reference)) start = new Date(+reference + interval * minute);
    else if (startClock) start = resolveClock(startClock, date);
    else if (part) start = resolveClock(defaultClock(part), date);
    else if (date) {
      start = smartInputInstant(date, defaultClock(null));
      if (date === today && +start < +reference) start = nextSmartInputBoundary(reference);
    } else start = nextSmartInputBoundary(reference);
    end = endClock ? smartInputInstant(endDate ?? dateKey(start), endClock) : new Date(+start + durationMinutes * minute);
    // Only explicit overnight language may advance a backwards end to next day.
    if (endClock && +end <= +start && /跨天|通宵|次日|第二天|翌日|到凌晨|至凌晨|overnight|next day/i.test(source)) {
      end = smartInputInstant(shiftDate(dateKey(start), 1), endClock);
    }
    if (+end <= +start) end = new Date(+start + durationMinutes * minute);
  }
  let repeat = evidence(raw.repeat, source) ?? "NONE";
  if (/每天|每日|\bevery day\b|\bdaily\b/i.test(source)) repeat = "DAILY";
  else if (/每两周|隔周|\b(?:every two weeks|biweekly)\b/i.test(source)) repeat = "BIWEEKLY";
  else if (/每周|每星期|\bweekly\b|\bevery (?:mon|tue|wed|thu|fri|sat|sun)/i.test(source)) repeat = "WEEKLY";
  else if (/每月|\bmonthly\b/i.test(source)) repeat = "MONTHLY";
  else if (/每年|\byearly\b/i.test(source)) repeat = "YEARLY";
  if (/隔几天/.test(source)) repeat = "NONE";
  const until = evidence(raw.repeatUntil, source);
  const repeatUntil = until && validDate(until) ? smartInputInstant(until, "23:59").toISOString()
    : until && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(until) && Number.isFinite(Date.parse(until)) ? new Date(until).toISOString() : "";
  const mapped = resolveCategoryFromPreset(raw.categoryPreset, categories);
  return {
    title: truncateText(raw.title || source, 120),
    location: truncateText(raw.location && source.includes(raw.location.text) && source.includes(raw.location.value) ? raw.location.value : "", 120),
    note: truncateText(raw.note && source.includes(raw.note.text) && source.includes(raw.note.value) ? raw.note.value : "", 500),
    startAt: start.toISOString(), endAt: end.toISOString(), repeat,
    repeatUntil: repeat !== "NONE" && Date.parse(repeatUntil) >= +start ? repeatUntil : "",
    categoryId: mapped.status === "matched" ? mapped.categoryId : null,
    categoryPreset: mapped.status === "matched" ? mapped.presetKey : null,
  };
}

/** Pure preview policy. Never called when saving edited drafts (SI-01/SI-06). */
export function completeSmartInputDrafts(params: {
  text: string; referenceTime: Date; categories: UserCategoryForMapping[]; extracted?: unknown;
}): ParseNaturalScheduleResult {
  const source = params.text.trim();
  const fragments = source.split(/[;；\n]+/).map((part) => part.trim()).filter(Boolean);
  const payload = params.extracted as { events?: unknown } | null;
  const rawEvents = Array.isArray(payload?.events) && payload.events.length > 0 && payload.events.length <= 10 ? payload.events : null;
  // More than ten/unusable model events retain the whole input in a basic draft;
  // do not silently drop the eleventh event or lose the user's original text.
  const entries = rawEvents ?? (fragments.length <= 10 ? fragments.map((source) => ({ source })) : [{ source }]);
  return {
    events: entries.map((entry, index) => {
      const parsed = llmParsedEventSchema.safeParse(entry);
      const raw = parsed.success ? parsed.data : llmParsedEventSchema.parse({});
      const eventSource = raw.source && source.includes(raw.source) ? raw.source : fragments[index] ?? source;
      return completeEvent(raw, eventSource, params.referenceTime, params.categories);
    }),
    warnings: [],
  };
}
