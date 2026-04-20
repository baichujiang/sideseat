import { ConnectionStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { blockSchema } from "@/lib/validators/invitation";

export async function POST(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const contentType = request.headers.get("content-type") ?? "";
    const formData = contentType.includes("application/json") ? null : await request.formData();
    const values = contentType.includes("application/json")
      ? await parseJson(request, blockSchema)
      : blockSchema.parse({
          blockedId: formData?.get("blockedId"),
          connectionId: formData?.get("connectionId") || undefined,
          reason: formData?.get("reason") || "",
        });

    await prisma.$transaction(async (tx) => {
      await tx.block.upsert({
        where: {
          blockerId_blockedId: {
            blockerId: user.id,
            blockedId: values.blockedId,
          },
        },
        create: {
          blockerId: user.id,
          blockedId: values.blockedId,
          connectionId: values.connectionId,
          reason: values.reason || null,
        },
        update: {
          reason: values.reason || null,
          connectionId: values.connectionId,
        },
      });

      if (values.connectionId) {
        await tx.connection.update({
          where: { id: values.connectionId },
          data: {
            status: ConnectionStatus.BLOCKED,
            endedById: user.id,
            endedAt: new Date(),
          },
        });
      }
    });

    if (!contentType.includes("application/json")) {
      return NextResponse.redirect(new URL("/inbox", request.url));
    }

    return ok({ blocked: true }, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to block user.");
  }
}
