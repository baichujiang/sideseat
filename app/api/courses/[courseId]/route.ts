import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";

/** Course identity for add-form prefill (any school). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  try {
    await requireOnboardedUser();
    const { courseId } = await params;

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, code: true, name: true },
    });
    if (!course) {
      return error("Course not found.", 404);
    }

    return ok(course);
  } catch (cause) {
    console.error(cause);
    return error("Unable to load course.");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { courseId } = await params;

    await prisma.userCourse.deleteMany({
      where: {
        userId: user.id,
        courseId,
      },
    });

    return ok({ deleted: true });
  } catch (cause) {
    console.error(cause);
    return error("Unable to remove course.");
  }
}
