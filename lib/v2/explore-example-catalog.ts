// Owner-published examples, not student profiles or matching participants.
// Only these server-owned IDs may supply the explicitly labeled example cards.
export const EXPLORE_EXAMPLE_MARKER = "SideSeat official Explore examples v1";
export const EXPLORE_EXAMPLE_NOTE = "示例 / Demo · 非真实邀约，不会回复。Not a real invitation. 可点“我也想做”创建自己的意愿。";
export const EXPLORE_EXAMPLE_AUTHORS = [
  { id: "cexampletum2026091200000001", username: "sideseat_showcase_explore_tum", school: "TUM" },
  { id: "cexamplelmu2026091200000001", username: "sideseat_showcase_explore_lmu", school: "LMU" },
] as const;

export const EXPLORE_EXAMPLE_CASES = [
  { key: "coffee", topic: "COFFEE", activityText: "课后喝咖啡", period: "AFTERNOON" },
  { key: "study", topic: "STUDY", studyGoal: "图书馆一起复习", period: "MORNING" },
  { key: "badminton", topic: "SPORTS", sportTag: "BADMINTON", period: null },
  { key: "food", topic: "FOOD", activityText: "一起尝试新餐厅", period: "EVENING" },
  { key: "walk", topic: "EXPLORE", activityText: "校园散步，认识新朋友", period: "AFTERNOON" },
] as const;

export function exploreExampleIntentId(authorId: string, key: string): string {
  return `${authorId}${key}`;
}
