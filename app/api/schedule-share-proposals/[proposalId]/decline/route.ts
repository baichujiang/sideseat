import { error } from "@/lib/http";

/** @deprecated Decline schedule-share plans from the chat thread via plan-requests decline. */
export async function POST() {
  return error(
    "Schedule share proposals are now handled in Chats. Open the conversation and decline the plan there.",
    410,
  );
}
