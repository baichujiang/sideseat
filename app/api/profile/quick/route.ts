import { validateNicknameForUser } from "@/lib/auth/nickname-fields";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";
import {
  NICKNAME_ERROR_CODES,
  nicknameValidationErrorMessage,
} from "@/lib/profile/nickname-api-errors";
import { homeProfileQuickPatchSchema } from "@/lib/validators/profile";

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const raw = await request.json().catch(() => ({}));
    const parsed = parseBody(raw, homeProfileQuickPatchSchema);
    if (!parsed.ok) {
      return error(parsed.error, 422);
    }
    const values = parsed.data;

    const data: { nickname?: string; nicknameKey?: string; bio?: string | null } = {};
    if (values.nickname !== undefined) {
      const nicknameCheck = await validateNicknameForUser(values.nickname, { excludeUserId: user.id });
      if (!nicknameCheck.ok) {
        const code =
          nicknameCheck.reason === "taken"
            ? NICKNAME_ERROR_CODES.TAKEN
            : NICKNAME_ERROR_CODES.RESERVED;
        return error(
          nicknameValidationErrorMessage(nicknameCheck.reason, {
            taken: "That name is already taken.",
            reserved: "That name is reserved.",
          }, "Invalid name."),
          nicknameCheck.reason === "taken" ? 409 : 422,
          code,
        );
      }
      data.nickname = nicknameCheck.nickname;
      data.nicknameKey = nicknameCheck.nicknameKey;
    }
    if (values.bio !== undefined) {
      data.bio = values.bio.trim() ? values.bio.trim() : null;
    }

    await prisma.user.update({
      where: { id: user.id },
      data,
    });

    return ok({ saved: true });
  } catch (cause) {
    console.error(cause);
    return error("Unable to update profile.");
  }
}
