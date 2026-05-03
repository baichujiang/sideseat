import { NextResponse } from "next/server";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { safeReturnPath } from "@/lib/nav/back";

/** Show this course chat in Contacts again after it was hidden from the list. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const user = await requireOnboardedUser();
  const { courseId } = await params;
  const url = new URL(request.url);
  const qsReturnTo = url.searchParams.get("returnTo");
  let formReturnTo: string | null = null;

  const contentType = request.headers.get("content-type") ?? "";
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const fd = await request.formData();
    const raw = fd.get("returnTo");
    formReturnTo = typeof raw === "string" ? raw : null;
  }

  await prisma.userCourse.updateMany({
    where: { userId: user.id, courseId },
    data: { inboxHiddenAt: null },
  });

  const redirectTo = safeReturnPath(formReturnTo ?? qsReturnTo, `/courses/${courseId}`);
  return NextResponse.redirect(new URL(redirectTo, request.url));
}
