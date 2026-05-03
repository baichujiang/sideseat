import { z } from "zod";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { getCurrentSemesterLabel } from "@/lib/constants/semester";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";

const saveBodySchema = z.object({
  courseId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const raw = await request.json().catch(() => ({}));
    const parsed = parseBody(raw, saveBodySchema);
    if (!parsed.ok) return error(parsed.error);

    const semesterLabel = getCurrentSemesterLabel();

    const course = await prisma.course.findFirst({
      where: {
        id: parsed.data.courseId,
        semesterLabel,
      },
    });
    if (!course) {
      return error("Course not found for this semester.");
    }

    const enrolled = await prisma.userCourse.findUnique({
      where: {
        userId_courseId: { userId: user.id, courseId: course.id },
      },
    });
    if (enrolled) {
      return error("This course is already on your schedule.");
    }

    await prisma.savedCourse.upsert({
      where: {
        userId_courseId: { userId: user.id, courseId: course.id },
      },
      create: { userId: user.id, courseId: course.id },
      update: {},
    });

    return ok({ courseId: course.id }, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to save course.");
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const url = new URL(request.url);
    const courseId = url.searchParams.get("courseId")?.trim() ?? "";
    if (!courseId) return error("courseId is required.");

    await prisma.savedCourse.deleteMany({
      where: { userId: user.id, courseId },
    });

    return ok({ ok: true });
  } catch (cause) {
    console.error(cause);
    return error("Unable to remove saved course.");
  }
}
