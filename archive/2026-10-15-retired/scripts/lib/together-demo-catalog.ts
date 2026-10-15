import { SocialIntentTopic, SportTag } from "@prisma/client";

export type TogetherDemoCase = {
  key: string;
  label: string;
  topic: SocialIntentTopic;
  activityText?: string;
  studyGoal?: string;
  sportTag?: SportTag;
  sportOtherNote?: string;
};

export const TOGETHER_DEMO_CASES: TogetherDemoCase[] = [
  {
    key: "coffee",
    label: "咖啡",
    topic: "COFFEE",
    activityText: "QA 测试 · 课后喝咖啡",
  },
  {
    key: "study",
    label: "学习",
    topic: "STUDY",
    studyGoal: "QA 测试 · 图书馆复习",
  },
  {
    key: "explore",
    label: "探索",
    topic: "EXPLORE",
    activityText: "QA 测试 · 校园散步",
  },
  {
    key: "food",
    label: "吃饭",
    topic: "FOOD",
    activityText: "QA 测试 · 食堂吃饭",
  },
  {
    key: "events",
    label: "活动",
    topic: "EVENTS",
    activityText: "QA 测试 · 参加校园活动",
  },
  ...(
    [
      ["basketball", "篮球", "BASKETBALL"],
      ["badminton", "羽毛球", "BADMINTON"],
      ["table_tennis", "乒乓球", "TABLE_TENNIS"],
      ["football", "足球", "FOOTBALL"],
      ["volleyball", "排球", "VOLLEYBALL"],
      ["tennis", "网球", "TENNIS"],
      ["gym", "健身", "GYM"],
      ["running", "跑步", "RUNNING"],
      ["hiking", "徒步", "HIKING"],
      ["cycling", "骑行", "CYCLING"],
      ["swimming", "游泳", "SWIMMING"],
      ["skiing", "滑雪", "SKIING"],
      ["climbing", "攀岩", "CLIMBING"],
      ["yoga", "瑜伽", "YOGA"],
      ["other", "其他运动（飞盘）", "OTHER"],
    ] as const
  ).map(([key, label, sportTag]) => ({
    key,
    label,
    topic: SocialIntentTopic.SPORTS,
    sportTag,
    ...(sportTag === "OTHER" ? { sportOtherNote: "QA 测试飞盘" } : {}),
  })),
];

export function demoBatch(batch: string): TogetherDemoCase[] {
  const sports = TOGETHER_DEMO_CASES.filter((item) => item.topic === "SPORTS");
  switch (batch) {
    case "categories":
      return TOGETHER_DEMO_CASES.filter(
        (item) => item.topic !== "SPORTS" || item.key === "badminton",
      );
    case "sports-a":
      return sports.slice(0, 8);
    case "sports-b":
      return sports.slice(8);
    default:
      throw new Error("Choose categories, sports-a or sports-b.");
  }
}

export function demoIntentInput(
  item: TogetherDemoCase,
  courseId: string,
  window: { startAt: string; endAt: string },
  run: string,
) {
  const { key, label, ...activity } = item;
  return {
    ...activity,
    togetherMode: "SAME_ACTIVITY" as const,
    courseId,
    timeWindows: [window],
    timeZone: "Europe/Berlin",
    note: `QA-DEMO:${run}:${key} · ${label}内部测试，非真实邀约；请保留测试范围。`,
  };
}
