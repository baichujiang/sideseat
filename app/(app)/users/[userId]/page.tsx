import Link from "next/link";

import { ContactRemarkEditor } from "@/components/chat/contact-remark-editor";
import { PeerProfileMenu } from "@/components/profile/peer-profile-menu";
import { ProfileMessageButton } from "@/components/profile/profile-message-button";
import { PeerProfileView } from "@/components/profile/peer-profile-view";
import { BackLink } from "@/components/nav/back-link";
import { requirePublicProfileAccess } from "@/lib/auth/guards";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import { getMessages } from "@/lib/i18n/messages";
import { buildProfileSchoolSummary } from "@/lib/profile/build-school-summary";

export default async function PeerUserProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const { userId } = await params;
  const query = (await searchParams) ?? {};
  const access = await requirePublicProfileAccess(userId);
  const { peer, courseName } = access;
  const locale = await getServerAppLocale();
  const ui = getMessages(locale);
  const up = ui.userProfile;

  const friendLinkReturnTo =
    query.returnTo != null && query.returnTo !== ""
      ? `/users/${userId}?returnTo=${encodeURIComponent(query.returnTo)}`
      : `/users/${userId}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-background/95 px-2 py-2 backdrop-blur-sm">
        <BackLink returnTo={query.returnTo} fallback="/discover" label={ui.common.back} />
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold">{up.screenTitle}</p>
        </div>
        <PeerProfileMenu
          peerUserId={peer.id}
          peerNickname={peer.nickname}
          connectionId={access.mode === "connection" ? access.connectionId : undefined}
          returnTo={friendLinkReturnTo}
        />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
        <PeerProfileView
          locale={locale}
          schoolSummary={buildProfileSchoolSummary({
            school: peer.school,
            degreeLevel: peer.degreeLevel,
            major: peer.major,
            semester: peer.semester,
          })}
          peer={{
            username: peer.username,
            nickname: peer.nickname,
            gender: peer.gender,
            avatarUrl: peer.avatarUrl,
            bio: peer.bio,
            school: peer.school,
            verifiedStudent: peer.verifiedStudent,
            studentVerificationStatus: peer.studentVerificationStatus,
            languages: peer.userLanguages.map((r) => ({
              tag: r.tag,
              proficiency: r.proficiency,
            })),
            lifePhotos: (peer.lifePhotos ?? []).map((p) => ({
              id: p.id,
              url: p.url,
              sortOrder: p.sortOrder,
            })),
          }}
          metVia={
            access.mode === "connection"
              ? courseName
              : access.sharedCourses[0]?.name ?? null
          }
          labels={{
            languagesSection: up.languagesSection,
            coursesSection: up.coursesSection,
            coursesEmpty: up.coursesEmpty,
            sharedCoursesOne: up.sharedCoursesOne,
            sharedCoursesMany: up.sharedCoursesMany,
            noCourseOverlap: up.noCourseOverlap,
          }}
          peerCourses={access.peerCourses.map((course) => ({
            id: course.id,
            code: course.code,
            name: course.name,
          }))}
          sharedCourses={access.sharedCourses.map((course) => ({
            id: course.id,
            code: course.code,
            name: course.name,
          }))}
          coursesReturnTo={friendLinkReturnTo}
          belowDisplayName={
            access.mode === "connection" ? (
              <ContactRemarkEditor
                connectionId={access.connectionId}
                initialRemark={access.myContactRemark}
                variant="underName"
                remarkPlaceholder={up.contactRemarkPlaceholder}
              />
            ) : null
          }
        />

        <div className="mt-4">
          {access.mode === "connection" ? (
            <Link
              href={`/connections/${access.connectionId}?returnTo=${encodeURIComponent(friendLinkReturnTo)}`}
              className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
            >
              {up.openChat}
            </Link>
          ) : (
            <ProfileMessageButton
              peerId={peer.id}
              courseId={access.sharedCourses[0]?.id}
              returnTo={friendLinkReturnTo}
            />
          )}
        </div>

      </div>
    </div>
  );
}
