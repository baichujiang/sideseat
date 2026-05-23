import { UserGender } from "@prisma/client";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";

const profileGenderPatchSchema = z.object({
  gender: z.nativeEnum(UserGender),
});

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const parsed = parseBody(await request.json().catch(() => ({})), profileGenderPatchSchema);
    if (!parsed.ok) {
      return error(parsed.error, 422);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { gender: parsed.data.gender },
    });

    return ok({ saved: true });
  } catch (cause) {
    console.error(cause);
    return error("Unable to update gender.");
  }
}
