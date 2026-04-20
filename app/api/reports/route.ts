import { ReportStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { reportSchema } from "@/lib/validators/invitation";

export async function POST(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const contentType = request.headers.get("content-type") ?? "";
    const formData = contentType.includes("application/json") ? null : await request.formData();
    const returnTo = (formData?.get("returnTo") as string | null) ?? null;
    const values = contentType.includes("application/json")
      ? await parseJson(request, reportSchema)
      : reportSchema.parse({
          reportedUserId: formData?.get("reportedUserId"),
          connectionId: formData?.get("connectionId") || undefined,
          invitationId: formData?.get("invitationId") || undefined,
          reason: formData?.get("reason"),
          details: formData?.get("details") || "",
        });

    const report = await prisma.report.create({
      data: {
        reporterId: user.id,
        reportedUserId: values.reportedUserId,
        connectionId: values.connectionId,
        invitationId: values.invitationId,
        reason: values.reason,
        status: ReportStatus.OPEN,
        details: values.details || null,
      },
    });

    if (!contentType.includes("application/json")) {
      const destination = returnTo
        ? new URL(`${returnTo}${returnTo.includes("?") ? "&" : "?"}reported=1`, request.url)
        : new URL("/reports?submitted=1", request.url);

      return NextResponse.redirect(destination);
    }

    return ok(report, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to submit report.");
  }
}
