import { requireOnboardedUser } from "@/lib/auth/guards";
import { DEFAULT_SCHOOL, normalizeSchoolCode } from "@/lib/constants/schools";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { courseSchema } from "@/lib/validators/course";

export async function GET() {
  const user = await requireOnboardedUser();
  const memberships = await prisma.userCourse.findMany({
    where: { userId: user.id },
    include: { course: true },
  });

  return ok(memberships);
}

export async function POST(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const values = await parseJson(request, courseSchema);
    const school = normalizeSchoolCode(user.school) ?? DEFAULT_SCHOOL;
    const code = values.code.trim().toUpperCase();

    const existingByCode = await prisma.course.findFirst({
      where: { code, school, semesterLabel: values.semesterLabel },
    });

    const course = existingByCode
      ? await prisma.course.update({
          where: { id: existingByCode.id },
          data: {
            name: values.name,
            location: values.location || null,
            schedule: values.schedule || null,
          },
        })
      : await prisma.course.upsert({
          where: {
            name_school_semesterLabel: {
              name: values.name,
              school,
              semesterLabel: values.semesterLabel,
            },
          },
          create: {
            name: values.name,
            code,
            school,
            semesterLabel: values.semesterLabel,
            location: values.location || null,
            schedule: values.schedule || null,
          },
          update: {
            code,
            location: values.location || null,
            schedule: values.schedule || null,
          },
        });

    const membership = await prisma.userCourse.upsert({
      where: {
        userId_courseId: {
          userId: user.id,
          courseId: course.id,
        },
      },
      create: {
        userId: user.id,
        courseId: course.id,
        intentions: values.intentions,
      },
      update: {
        intentions: values.intentions,
      },
    });

    return ok({ courseId: membership.courseId }, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to save course.");
  }
}
