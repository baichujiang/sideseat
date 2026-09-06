import { NextResponse } from "next/server";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { unblockUserForActor } from "@/lib/api/v1/blocks-service";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ blockedId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { blockedId } = await params;

    const result = await unblockUserForActor({
      db: prisma,
      blockerId: user.id,
      blockedId,
    });
    if (!result) return error("Unable to unblock user.", 404);

    return ok({ unblocked: true });
  } catch (cause) {
    console.error(cause);
    return error("Unable to unblock user.", 400);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ blockedId: string }> },
) {
  const formData = await request.formData();
  const method = String(formData.get("_method") ?? "").toUpperCase();

  if (method !== "DELETE") {
    return error("Method not allowed.", 405);
  }

  const response = await DELETE(request, { params });
  if (response instanceof Response && response.ok) {
    return NextResponse.redirect(new URL("/profile/blocked", request.url));
  }
  return response;
}
