import { InvitationForm } from "@/components/forms/invitation-form";
import { PersonCard } from "@/components/cards/person-card";
import { SectionHeader } from "@/components/layout/section-header";
import { StudentVerificationBanner } from "@/components/ui/student-verification-banner";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { getDiscoverPeople } from "@/lib/queries/discovery";

export default async function DiscoverPage() {
  const user = await requireOnboardedUser();
  const people = await getDiscoverPeople(user.id);

  return (
    <div className="space-y-5">
      {!user.verifiedStudent ? (
        <StudentVerificationBanner status={user.studentVerificationStatus} />
      ) : null}
      <SectionHeader title="Discover" />
      <div className="grid gap-4">
        {people.map(({ person, reasons, sharedCourseId }) => {
          return (
            <PersonCard
              key={person.id}
              nickname={person.nickname ?? "Student"}
              school={person.school}
              major={person.major}
              semester={person.semester}
              bio={person.bio}
              reasons={reasons}
              footer={
                sharedCourseId ? (
                  <InvitationForm
                    courseId={sharedCourseId}
                    disabled={!user.verifiedStudent}
                    disabledReason="Verify your student status in Profile before sending invitations."
                    receiverId={person.id}
                  />
                ) : null
              }
            />
          );
        })}
      </div>
    </div>
  );
}
