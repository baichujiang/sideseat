import Link from "next/link";
import { notFound } from "next/navigation";
import { InvitationStatus, StudentVerificationStatus } from "@prisma/client";

import {
  AdminUserEditForm,
  type AdminUserFormInitialValues,
} from "@/components/admin/admin-user-edit-form";
import { SectionHeader } from "@/components/layout/section-header";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAdminUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";

function verificationTone(status: StudentVerificationStatus) {
  if (status === StudentVerificationStatus.VERIFIED) return "calm";
  if (
    status === StudentVerificationStatus.EMAIL_PENDING ||
    status === StudentVerificationStatus.MANUAL_REVIEW_REQUIRED
  )
    return "warm";
  if (status === StudentVerificationStatus.REJECTED) return "danger";
  return "neutral";
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requireAdminUser();
  const { userId } = await params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      courses: {
        include: { course: true, sessions: true },
        orderBy: { createdAt: "desc" },
      },
      _count: {
        select: {
          sentInvitations: true,
          receivedInvitations: true,
          connectionsA: true,
          connectionsB: true,
          reportsFiled: true,
          reportsReceived: true,
        },
      },
    },
  });

  if (!user) {
    notFound();
  }

  const initial: AdminUserFormInitialValues = {
    nickname: user.nickname ?? "",
    email: user.email ?? "",
    school: user.school ?? "",
    degreeLevel: user.degreeLevel ?? "",
    major: user.major ?? "",
    semester: user.semester ?? "",
    bio: user.bio ?? "",
    wechatHandle: user.wechatHandle ?? "",
    whatsappHandle: user.whatsappHandle ?? "",
    telegramHandle: user.telegramHandle ?? "",
    instagramHandle: user.instagramHandle ?? "",
    verifiedStudent: user.verifiedStudent,
    studentVerificationStatus: user.studentVerificationStatus,
    studentVerificationNotes: user.studentVerificationNotes ?? "",
    onboardingComplete: user.onboardingComplete,
  };

  const [pendingInvitationsSent, acceptedInvitationsSent] = await Promise.all([
    prisma.invitation.count({
      where: { senderId: user.id, status: InvitationStatus.PENDING },
    }),
    prisma.invitation.count({
      where: { senderId: user.id, status: InvitationStatus.ACCEPTED },
    }),
  ]);

  const activeConnections = user._count.connectionsA + user._count.connectionsB;
  const totalInvitations = user._count.sentInvitations + user._count.receivedInvitations;

  return (
    <div className="space-y-5">
      <SectionHeader
        title={user.nickname ?? user.username}
        action={
          <Link className="text-sm font-medium text-foreground" href="/admin/users">
            ← All users
          </Link>
        }
      />

      <Card className="flex items-start gap-3">
        <PresetAvatar id={user.avatarUrl} size={56} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{user.nickname ?? user.username}</CardTitle>
            {user.isGuest ? (
              <StatusBadge tone="neutral">guest</StatusBadge>
            ) : null}
            <StatusBadge tone={verificationTone(user.studentVerificationStatus)}>
              {user.studentVerificationStatus.toLowerCase().replaceAll("_", " ")}
            </StatusBadge>
          </div>
          <CardDescription>
            @{user.username}
            {user.email ? ` · ${user.email}` : ""}
          </CardDescription>
          <p className="text-xs text-muted-foreground">
            Joined {user.createdAt.toLocaleString()} · Updated{" "}
            {user.updatedAt.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground">
            User ID: <code className="text-[11px]">{user.id}</code>
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Courses" value={user.courses.length} />
        <MiniStat label="Connections" value={activeConnections} />
        <MiniStat label="Invitations" value={totalInvitations} />
        <MiniStat
          label="Reports"
          value={`${user._count.reportsFiled}→ / ←${user._count.reportsReceived}`}
        />
      </div>

      <Card className="space-y-4">
        <div>
          <CardTitle className="text-base">Edit profile</CardTitle>
          <CardDescription>
            All changes are written directly. Leave a field untouched to keep
            the current value; clear a field to null it out.
          </CardDescription>
        </div>
        <AdminUserEditForm initial={initial} userId={user.id} />
      </Card>

      <Card className="space-y-3">
        <div>
          <CardTitle className="text-base">
            Courses · {user.courses.length}
          </CardTitle>
          <CardDescription>
            Pending invites sent: {pendingInvitationsSent} · Accepted:{" "}
            {acceptedInvitationsSent}
          </CardDescription>
        </div>

        {user.courses.length ? (
          <div className="divide-y divide-border">
            {user.courses.map((membership) => (
              <div className="flex items-start justify-between gap-3 py-2.5" key={membership.id}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {membership.course.name}
                    {membership.course.code ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {membership.course.code}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      membership.course.school,
                      membership.course.semesterLabel,
                      membership.sessions.length
                        ? `${membership.sessions.length} session${membership.sessions.length === 1 ? "" : "s"}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {membership.intentions.length ? (
                    <p className="text-xs text-muted-foreground">
                      Intentions:{" "}
                      {membership.intentions
                        .map((intent) => intent.toLowerCase().replaceAll("_", " "))
                        .join(", ")}
                    </p>
                  ) : null}
                </div>
                <p className="shrink-0 text-[11px] text-muted-foreground">
                  Joined {membership.createdAt.toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No courses registered" />
        )}
      </Card>

      {user.manualReviewProofUrl ? (
        <Card className="space-y-2">
          <CardTitle className="text-base">Enrollment certificate</CardTitle>
          <p className="text-sm text-muted-foreground">
            <a
              className="font-medium underline"
              href={user.manualReviewProofUrl}
              rel="noreferrer"
              target="_blank"
            >
              {user.manualReviewProofFilename ?? "Open file"}
            </a>
            {user.manualReviewRequestedAt
              ? ` · uploaded ${user.manualReviewRequestedAt.toLocaleString()}`
              : null}
          </p>
        </Card>
      ) : null}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
