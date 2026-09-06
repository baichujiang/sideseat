import { NextResponse } from "next/server";

import { installPairPeerBlock } from "@/lib/api/v1/pair-block-transaction";
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
      const installed = await installPairPeerBlock(tx, {
        userId: user.id,
        blockedId: values.blockedId,
        connectionId: values.connectionId,
        reason: values.reason,
        endedAt: new Date(),
      });
      if (installed.kind !== "blocked") {
        throw new Error("The blocked user must match this conversation.");
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
