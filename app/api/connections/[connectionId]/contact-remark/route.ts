import { NextResponse } from "next/server";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { CONTACT_REMARK_MAX_LEN } from "@/lib/connections/contact-remark";
import { parseBody } from "@/lib/http";
import { patchContactRemarkSchema } from "@/lib/validators/connection";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ connectionId: string }> },
) {
  const user = await requireOnboardedUser();
  const { connectionId } = await ctx.params;
  const raw = await req.json().catch(() => ({}));
  const parsed = parseBody(raw, patchContactRemarkSchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const remark =
    parsed.data.remark === null ? null : parsed.data.remark.slice(0, CONTACT_REMARK_MAX_LEN);

  const connection = await prisma.connection.findUnique({
    where: { id: connectionId },
    select: { id: true, userAId: true, userBId: true },
  });
  if (!connection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isA = connection.userAId === user.id;
  const isB = connection.userBId === user.id;
  if (!isA && !isB) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.connection.update({
    where: { id: connectionId },
    data: isA ? { contactRemarkByA: remark } : { contactRemarkByB: remark },
  });

  return NextResponse.json({ ok: true, remark });
}
