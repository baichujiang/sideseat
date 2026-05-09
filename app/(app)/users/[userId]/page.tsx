import Link from "next/link";
import type { Route } from "next";

import { ContactRemarkEditor } from "@/components/chat/contact-remark-editor";
import { PeerProfileMenu } from "@/components/profile/peer-profile-menu";
import { ProfileMessageButton } from "@/components/profile/profile-message-button";
import { PeerProfileView } from "@/components/profile/peer-profile-view";
import { BackLink } from "@/components/nav/back-link";
import { requirePublicProfileAccess } from "@/lib/auth/guards";
import { safeReturnPath } from "@/lib/nav/back";

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
  const { user, peer, courseName } = access;
  const backHref = safeReturnPath(query.returnTo, "/discover");

  const friendLinkReturnTo =
    query.returnTo != null && query.returnTo !== ""
      ? `/users/${userId}?returnTo=${encodeURIComponent(query.returnTo)}`
      : `/users/${userId}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-background/95 px-2 py-2 backdrop-blur-sm">
        <BackLink href={backHref} label="Back" />
        <div className="min-w-0 flex-1 pr-2">
          <p className="truncate text-sm font-semibold">Profile</p>
          <div className="flex min-w-0 items-center gap-1">
            <p className="truncate text-[11px] text-muted-foreground">
              {peer.nickname?.trim() || "Student"}
            </p>
            {access.mode === "connection" ? (
              <ContactRemarkEditor
                connectionId={access.connectionId}
                initialRemark={access.myContactRemark}
                variant="inline"
              />
            ) : null}
          </div>
        </div>
        <PeerProfileMenu
          peerUserId={peer.id}
          peerNickname={peer.nickname}
          connectionId={access.mode === "connection" ? access.connectionId : undefined}
          returnTo={friendLinkReturnTo}
        />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <PeerProfileView
          peer={{
            nickname: peer.nickname,
            gender: peer.gender,
            avatarUrl: peer.avatarUrl,
            bio: peer.bio,
            major: peer.major,
            semester: peer.semester,
            school: peer.school,
            degreeLevel: peer.degreeLevel,
            verifiedStudent: peer.verifiedStudent,
            studentVerificationStatus: peer.studentVerificationStatus,
            languages: peer.userLanguages.map((r) => ({
              tag: r.tag,
              proficiency: r.proficiency,
            })),
          }}
          metVia={
            access.mode === "connection"
              ? courseName
              : access.sharedCourses[0]?.name ?? null
          }
        />

        <div className="mt-4 space-y-2 rounded-2xl border border-border/60 bg-card px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Courses
          </p>
          {access.peerCourses.length === 0 ? (
            <p className="text-xs text-muted-foreground">No courses on their profile yet.</p>
          ) : (
            <>
              <ul className="flex flex-wrap gap-1.5">
                {access.peerCourses.map((course) => {
                  const isShared = access.sharedCourses.some((c) => c.id === course.id);
                  const courseHref =
                    `/courses/${course.id}?returnTo=${encodeURIComponent(friendLinkReturnTo)}` as Route;
                  const courseLabel = course.code ? `[${course.code}] ${course.name}` : course.name;
                  return (
                    <li key={course.id}>
                      <Link
                        href={courseHref}
                        className={
                          isShared
                            ? "inline-flex max-w-[14rem] rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition hover:bg-primary/15"
                            : "inline-flex max-w-[14rem] rounded-full bg-foreground/5 px-2.5 py-1 text-[11px] text-foreground/75 transition hover:bg-foreground/10"
                        }
                        title={courseLabel}
                      >
                        <span className="truncate">{courseLabel}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {access.sharedCourses.length > 0 ? (
                <p className="text-[11px] text-primary/90">
                  {access.sharedCourses.length} shared{" "}
                  {access.sharedCourses.length === 1 ? "course" : "courses"}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">No overlap with your courses.</p>
              )}
            </>
          )}
        </div>

        <div className="mt-4">
          {access.mode === "connection" ? (
            <Link
              href={`/connections/${access.connectionId}?returnTo=${encodeURIComponent(friendLinkReturnTo)}`}
              className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
            >
              Open chat
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
