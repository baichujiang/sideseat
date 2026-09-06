import { requireOnboardedUser } from "@/lib/auth/guards";
import {
  OpenConversationError,
  openConversationForUser,
} from "@/lib/connections/open-conversation";
import { error, ok, parseJson } from "@/lib/http";
import { openConversationSchema } from "@/lib/validators/invitation";

/**
 * Open-chat flow for profile cards:
 *   - if an ACTIVE thread exists, return it
 *   - otherwise create an empty ACTIVE thread and return it
 *
 * Unlike `/api/connections/start`, this endpoint does not send a first message.
 * The user lands directly in the thread page and writes in the normal composer.
 */
export async function POST(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const values = await parseJson(request, openConversationSchema);

    const result = await openConversationForUser(user, values);
    return ok(
      { connectionId: result.connectionId, created: result.created },
      { status: result.created ? 201 : 200 },
    );
  } catch (cause) {
    if (cause instanceof OpenConversationError) {
      switch (cause.code) {
        case "PEER_UNAVAILABLE":
          return error("That person is not available.", 404);
        case "CROSS_SCHOOL":
          return error("Cross-school messages are not available yet.", 403);
        case "CONTENT_RESTRICTED":
          return error("This user is unavailable for contact.", 403);
        case "CONVERSATION_ENDED":
          return error("This conversation is no longer available.", 409);
        case "COURSE_CONTEXT_INVALID":
          return error("That course context is no longer valid.", 403);
        case "POST_CONTEXT_INVALID":
          return error("That action is no longer available for contact.", 403);
        case "ACTION_COORDINATION_REQUIRED":
          return error("Respond from the action page to contact its creator.", 409);
        case "RATE_LIMITED":
          return error(
            "You've started too many new chats recently. Try again in a bit.",
            429,
          );
      }
    }
    console.error(cause);
    return error("Unable to open conversation.");
  }
}
