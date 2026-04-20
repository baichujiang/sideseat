import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/link-button";
import { CourseCard } from "@/components/cards/course-card";
import { SectionHeader } from "@/components/layout/section-header";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";

export default async function CoursesPage() {
  const user = await requireOnboardedUser();
  const memberships = await prisma.userCourse.findMany({
    where: { userId: user.id },
    include: {
      course: {
        include: {
          members: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return (
    <div className="space-y-5">
      <SectionHeader
        title="My courses"
        action={<LinkButton href="/courses/add" size="sm">Add</LinkButton>}
      />
      <div className="grid gap-4">
        {memberships.length ? (
          memberships.map((membership) => (
            <CourseCard
              key={membership.id}
              course={membership.course}
              intentions={membership.intentions}
              memberCount={membership.course.members.length}
            />
          ))
        ) : (
          <EmptyState
            title="No courses yet"
            action={<LinkButton href="/courses/add" size="sm">Add your first course</LinkButton>}
          />
        )}
      </div>
    </div>
  );
}
