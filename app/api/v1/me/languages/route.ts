import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error } from "@/lib/api/v1/http";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { loadNativeCurrentProfile } from "@/lib/api/v1/profile-service";
import { prisma } from "@/lib/db/prisma";
import { profileObjectSchema } from "@/lib/validators/profile";

export const dynamic = "force-dynamic";

const nativeLanguagesSchema = z
  .object({
    languages: profileObjectSchema.shape.languages,
  })
  .strict();

function localeFromRequest(request: Request): "en" | "zh-CN" {
  const language = request.headers.get("accept-language")?.toLowerCase() ?? "";
  return language.startsWith("zh") ? "zh-CN" : "en";
}

export async function PUT(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The request body must be valid JSON.",
      status: 422,
    });
  }

  const parsed = nativeLanguagesSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: issue?.message ?? "Choose at least one language.",
      status: 422,
      field: issue?.path.length ? issue.path.join(".") : "languages",
    });
  }

  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: "native-profile-languages",
      requestBody: parsed.data,
      execute: async () => {
        await prisma.$transaction(async (tx) => {
          await tx.userLanguage.deleteMany({ where: { userId: auth.user.id } });
          await tx.userLanguage.createMany({
            data: parsed.data.languages.map((language) => ({
              userId: auth.user.id,
              tag: language.tag,
              proficiency: language.proficiency,
            })),
          });
        });

        const profile = await loadNativeCurrentProfile({
          user: auth.user,
          locale: localeFromRequest(request),
        });
        if (!profile) {
          throw new Error("The current profile was not found after updating languages.");
        }

        return {
          status: 200,
          body: profile as Prisma.InputJsonValue,
        };
      },
    });
  } catch (cause) {
    console.error("PUT /api/v1/me/languages", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Languages could not be updated.",
      status: 500,
      retryable: true,
    });
  }
}
