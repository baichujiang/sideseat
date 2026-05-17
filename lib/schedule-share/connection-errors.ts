import {
  PUBLIC_SCHEDULE_CANNOT_OPEN_CHAT,
  PUBLIC_SCHEDULE_CANNOT_OPEN_CHAT_BLOCKED,
  PUBLIC_SCHEDULE_CANNOT_OPEN_CHAT_RATE_LIMIT,
  PUBLIC_SCHEDULE_PROPOSAL_ALREADY_ACCEPTED,
} from "@/lib/schedule-share/public-errors";
import type { SubmitScheduleSharePlanError } from "@/lib/schedule-share/create-plan-from-guest-proposal";

export function publicErrorForScheduleShareConnection(
  reason: SubmitScheduleSharePlanError,
): { message: string; status: number } {
  switch (reason) {
    case "already_accepted":
      return { message: PUBLIC_SCHEDULE_PROPOSAL_ALREADY_ACCEPTED, status: 409 };
    case "blocked":
      return { message: PUBLIC_SCHEDULE_CANNOT_OPEN_CHAT_BLOCKED, status: 403 };
    case "rate_limited":
      return { message: PUBLIC_SCHEDULE_CANNOT_OPEN_CHAT_RATE_LIMIT, status: 429 };
    case "peer_unavailable":
    case "conversation_unavailable":
    default:
      return { message: PUBLIC_SCHEDULE_CANNOT_OPEN_CHAT, status: 403 };
  }
}
