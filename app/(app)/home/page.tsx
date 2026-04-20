import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { StudentVerificationBanner } from "@/components/ui/student-verification-banner";
import { CourseCard } from "@/components/cards/course-card";
import { PersonCard } from "@/components/cards/person-card";
import { SectionHeader } from "@/components/layout/section-header";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { getDashboardData } from "@/lib/queries/dashboard";

export default async function HomePage() {
  const user = await requireOnboardedUser();
  const data = await getDashboardData(user.id);

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-xl">Hi, {user.nickname ?? user.username}</CardTitle>
          <StatusBadge tone={user.verifiedStudent ? "calm" : "warm"}>
            {user.verifiedStudent ? "Verified" : "Verify school"}
          </StatusBadge>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <StatCard label="Courses" value={data.userCourses.length} />
          <StatCard label="Invites" value={data.receivedInvitations.length} />
          <StatCard label="Connections" value={data.connections.length} />
        </div>
      </Card>

      {!user.verifiedStudent ? (
        <StudentVerificationBanner compact status={user.studentVerificationStatus} />
      ) : null}

      <section>
        <SectionHeader
          title="Your courses"
          action={<LinkButton href="/courses/add" size="sm" variant="outline">Add course</LinkButton>}
        />
        <div className="grid gap-4">
          {data.userCourses.length ? (
            data.userCourses.map((membership) => (
              <CourseCard
                key={membership.id}
                course={membership.course}
                intentions={membership.intentions}
              />
            ))
          ) : (
            <EmptyState
              action={<LinkButton href="/courses/add" size="sm">Add your first course</LinkButton>}
              title="No courses yet"
            />
          )}
        </div>
      </section>

      <section>
        <SectionHeader title="Pending invitations" />
        <div className="grid gap-4">
          {data.receivedInvitations.length ? (
            data.receivedInvitations.map((invitation) => (
              <Card key={invitation.id} className="space-y-2">
                <CardTitle>{invitation.sender.nickname} invited you</CardTitle>
                <CardDescription>
                  {invitation.type.toLowerCase().replaceAll("_", " ")} · {invitation.course.name}
                </CardDescription>
                {invitation.note ? <p className="text-sm">{invitation.note}</p> : null}
              </Card>
            ))
          ) : (
            <EmptyState title="Nothing urgent right now" />
          )}
        </div>
      </section>

      <section>
        <SectionHeader title="Active connections" />
        <div className="grid gap-4">
          {data.connections.length ? (
            data.connections.map((connection) => {
              const otherUser = connection.userAId === user.id ? connection.userB : connection.userA;

              return (
                <Card key={connection.id} className="space-y-3">
                  <CardTitle>{otherUser.nickname}</CardTitle>
                  {connection.invitation?.course ? (
                    <CardDescription>{connection.invitation.course.name}</CardDescription>
                  ) : null}
                  <LinkButton className="w-full" href={`/connections/${connection.id}`} variant="outline">
                    Open chat
                  </LinkButton>
                </Card>
              );
            })
          ) : (
            <EmptyState title="No active connections yet" />
          )}
        </div>
      </section>

      <section>
        <SectionHeader
          title="People in your circle"
          action={<LinkButton href="/discover" size="sm" variant="outline">See all</LinkButton>}
        />
        <div className="grid gap-4">
          {data.discoverPeople.length ? (
            data.discoverPeople.slice(0, 3).map((person) => (
              <PersonCard
                key={person.id}
                nickname={person.nickname ?? "Student"}
                school={person.school}
                major={person.major}
                semester={person.semester}
                bio={person.bio}
                reasons={person.courses.slice(0, 2).map((membership) => ({
                  label: `You both joined ${membership.course.name}`,
                }))}
              />
            ))
          ) : (
            <EmptyState title="No classmates yet" />
          )}
        </div>
      </section>
    </div>
  );
}
