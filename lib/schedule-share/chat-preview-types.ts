import type { PublicScheduleShareSnapshot } from "@/lib/schedule-share/build-schedule-share-snapshot";

export type ScheduleShareChatPreviewPayload = {
  snapshot: PublicScheduleShareSnapshot;
  expired: boolean;
  ownerDisplayLabel: string;
};
