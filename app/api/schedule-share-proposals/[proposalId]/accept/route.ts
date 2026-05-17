import { error } from "@/lib/http";

/** @deprecated Accept schedule-share plans from the chat thread via plan-requests accept. */
export async function POST() {
  return error(
    "Schedule share proposals are now handled in Chats. Open the conversation and accept the plan there.",
    410,
  );
}
