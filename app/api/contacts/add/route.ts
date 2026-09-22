import {
  addContact,
  ContactsServiceError,
} from "@/lib/api/v1/contacts-service";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { error, ok, parseJson } from "@/lib/http";
import { contactAddSchema } from "@/lib/validators/chat-directory";

export async function POST(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const values = await parseJson(request, contactAddSchema);

    const result = await addContact({ userId: user.id, peerId: values.peerId });
    return ok(result, { status: result.created ? 201 : 200 });
  } catch (cause) {
    if (cause instanceof ContactsServiceError) {
      switch (cause.code) {
        case "INVALID_REQUEST":
          return error("You are already in your own notes chat.");
        case "NOT_FOUND":
          return error("That user is not available.", 404);
        case "CONTENT_RESTRICTED":
          return error("This user is unavailable for contact.", 403);
        case "CONFLICT":
          return error("This conversation is no longer available.", 409);
      }
    }
    console.error(cause);
    return error("Unable to add contact.");
  }
}
