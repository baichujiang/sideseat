import { notFound } from "next/navigation";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { CourseRemoveButton } from "@/components/forms/course-remove-button";
import { InvitationForm } from "@/components/forms/invitation-form";
import { PersonCard } from "@/components/cards/person-card";
import { StudentVerificationBanner } from "@/components/ui/student-verification-banner";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { getSchoolMatchValues } from "@/lib/constants/schools";
import { prisma } from "@/lib/db/prisma";

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const user = await requireOnboardedUser();
  const schoolValues = getSchoolMatchValues(user.school);

  const membership = await prisma.userCourse.findFirst({
    where: {
      userId: user.id,
      courseId,
    },
    include: {
      course: {
        include: {
          members: {
            where: {
              userId: {
                not: user.id,
              },
              user: {
                school: schoolValues.length ? { in: schoolValues } : undefined,
                moderationBlocks: {
                  none: {
                    isActive: true,
                  },
                },
              },
            },
            include: {
              user: true,
            },
          },
        },
      },
    },
  });

  if (!membership) {
    notFound();
  }

  return (
    <div className="space-y-5">
      {!user.verifiedStudent ? (
        <StudentVerificationBanner status={user.studentVerificationStatus} />
      ) : null}
      <Card className="space-y-2">
        <CardTitle>{membership.course.name}</CardTitle>
        <CardDescription>
          {membership.course.school} · {membership.course.semesterLabel}
        </CardDescription>
        <CourseRemoveButton courseId={membership.course.id} />
      </Card>
      <div className="grid gap-4">
        {membership.course.members.map((personMembership) => (
          <PersonCard
            key={personMembership.id}
            nickname={personMembership.user.nickname ?? "Student"}
            school={personMembership.user.school}
            major={personMembership.user.major}
            semester={personMembership.user.semester}
            bio={personMembership.user.bio}
            reasons={[{ label: `You both joined ${membership.course.name}` }]}
            footer={
              <InvitationForm
                courseId={membership.course.id}
                disabled={!user.verifiedStudent}
                disabledReason="Verify your student status in Profile before sending invitations."
                receiverId={personMembership.user.id}
              />
            }
          />
        ))}
      </div>
    </div>
  );
}
