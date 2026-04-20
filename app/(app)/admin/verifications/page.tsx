import Link from "next/link";
import { StudentVerificationStatus } from "@prisma/client";

import { StudentVerificationReview } from "@/components/admin/student-verification-review";
import { SectionHeader } from "@/components/layout/section-header";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAdminUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";

function tone(status: StudentVerificationStatus) {
  if (status === StudentVerificationStatus.VERIFIED) return "calm";
  if (status === StudentVerificationStatus.EMAIL_PENDING) return "warm";
  if (status === StudentVerificationStatus.MANUAL_REVIEW_REQUIRED) return "danger";
  if (status === StudentVerificationStatus.REJECTED) return "danger";
  return "neutral";
}

export default async function AdminVerificationsPage() {
  await requireAdminUser();

  const users = await prisma.user.findMany({
    where: {
      studentVerificationStatus: {
        in: [
          StudentVerificationStatus.EMAIL_PENDING,
          StudentVerificationStatus.MANUAL_REVIEW_REQUIRED,
          StudentVerificationStatus.REJECTED,
          StudentVerificationStatus.VERIFIED,
        ],
      },
    },
    include: {
      schoolEmailVerifications: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Student verification"
        action={
          <Link className="text-sm font-medium text-foreground" href="/admin/reports">
            Back to reports
          </Link>
        }
      />

      <div className="grid gap-4">
        {users.length ? (
          users.map((user) => (
            <Card key={user.id} className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle>{user.nickname ?? user.username}</CardTitle>
                  <CardDescription>
                    Account: {user.email ?? user.username} · School email: {user.schoolEmail ?? "not submitted"}
                  </CardDescription>
                </div>
                <StatusBadge tone={tone(user.studentVerificationStatus)}>
                  {user.studentVerificationStatus.toLowerCase().replaceAll("_", " ")}
                </StatusBadge>
              </div>

              <div className="grid gap-1 text-sm text-muted-foreground">
                <p>School: {user.school ?? "not set"}</p>
                <p>Major: {user.major ?? "not set"}</p>
                {user.schoolEmailVerifiedAt ? (
                  <p>Verified at: {user.schoolEmailVerifiedAt.toLocaleString()}</p>
                ) : null}
                {user.studentVerificationNotes ? (
                  <p className="text-foreground">{user.studentVerificationNotes}</p>
                ) : null}
                {user.schoolEmailVerifications[0] ? (
                  <p>
                    Latest request expires:{" "}
                    {user.schoolEmailVerifications[0].expiresAt.toLocaleString()}
                  </p>
                ) : null}
              </div>

              <StudentVerificationReview userId={user.id} />
            </Card>
          ))
        ) : (
          <EmptyState title="No verification cases yet" />
        )}
      </div>
    </div>
  );
}
