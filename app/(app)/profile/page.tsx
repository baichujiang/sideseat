import Link from "next/link";

import { StudentVerificationForm } from "@/components/forms/student-verification-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "@/components/forms/profile-form";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { adminEmails } from "@/lib/constants/app";
import { DEFAULT_SCHOOL, normalizeSchoolCode } from "@/lib/constants/schools";
import { getSchoolVerificationHint } from "@/lib/constants/verification";
import { prisma } from "@/lib/db/prisma";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams?: Promise<{ verification?: string }>;
}) {
  const user = await requireOnboardedUser();
  const query = (await searchParams) ?? {};

  if (user.isGuest) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold tracking-tight">Profile</h1>

        <Card className="space-y-3 border-dashed border-primary/30 bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
              G
            </div>
            <CardTitle className="text-base">Guest session</CardTitle>
          </div>
          <form action="/api/auth/end-guest?to=signup" method="post">
            <Button className="w-full" type="submit">
              Create an account
            </Button>
          </form>
          <form action="/api/auth/end-guest?to=login" method="post">
            <Button className="w-full" type="submit" variant="outline">
              Log in with an existing account
            </Button>
          </form>
        </Card>

        <form action="/api/auth/logout" method="post">
          <Button className="w-full" type="submit" variant="ghost">
            End guest session
          </Button>
        </form>
      </div>
    );
  }

  const blockedUsers = await prisma.block.findMany({
    where: { blockerId: user.id },
    include: { blocked: true },
  });
  const isAdmin = Boolean(user.email && adminEmails.includes(user.email.toLowerCase()));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Profile</h1>

      {query.verification === "success" ? (
        <p className="rounded-2xl border border-[#d5e9df] bg-[#eef8f2] px-4 py-3 text-sm text-foreground">
          Student email verified — you can send invitations now.
        </p>
      ) : null}
      {query.verification === "expired" ? (
        <p className="rounded-2xl border border-[#f0d8d4] bg-[#fff3f1] px-4 py-3 text-sm text-foreground">
          That verification link expired. Request a new one below.
        </p>
      ) : null}
      {query.verification === "invalid" ? (
        <p className="rounded-2xl border border-[#f0d8d4] bg-[#fff3f1] px-4 py-3 text-sm text-foreground">
          That link wasn&apos;t valid. Request a fresh verification email below.
        </p>
      ) : null}

      {isAdmin ? (
        <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-muted/40 px-3 py-2.5">
          <span className="w-full text-xs font-medium text-muted-foreground">Admin</span>
          <Link
            className="rounded-full bg-[#e5f1ee] px-3 py-1.5 text-xs font-semibold text-[#20524d]"
            href="/admin/reports"
          >
            Reports
          </Link>
          <Link
            className="rounded-full bg-[#f4ede0] px-3 py-1.5 text-xs font-semibold text-[#6f4d1c]"
            href="/admin/verifications"
          >
            Verify
          </Link>
          <Link
            className="rounded-full bg-[#eef2f6] px-3 py-1.5 text-xs font-semibold text-[#2f4f6b]"
            href="/admin/safety"
          >
            Safety
          </Link>
        </div>
      ) : null}

      <ProfileForm
        submitLabel="Save"
        avatarId={user.avatarUrl}
        verificationSlot={
          <StudentVerificationForm
            currentStatus={user.studentVerificationStatus}
            schoolHint={getSchoolVerificationHint(user.school)}
            notes={user.studentVerificationNotes}
            email={user.email}
          />
        }
        initialValues={{
          nickname: user.nickname ?? "",
          school: normalizeSchoolCode(user.school) ?? DEFAULT_SCHOOL,
          degreeLevel: user.degreeLevel ?? "BACHELOR",
          major: user.major ?? "",
          semester: user.semester ?? 1,
          bio: user.bio ?? "",
          discoverByCourse: user.discoverByCourse,
          discoverByMajor: user.discoverByMajor,
          discoverBySemester: user.discoverBySemester,
          allowInvitationNotes: user.allowInvitationNotes,
          contactInfoOptIn: user.contactInfoOptIn,
          wechatHandle: user.wechatHandle ?? "",
          whatsappHandle: user.whatsappHandle ?? "",
          telegramHandle: user.telegramHandle ?? "",
          instagramHandle: user.instagramHandle ?? "",
        }}
      />

      {blockedUsers.length ? (
        <Card className="space-y-2">
          <CardTitle className="text-base">Blocked</CardTitle>
          <ul className="list-inside list-disc text-sm text-muted-foreground">
            {blockedUsers.map((block) => (
              <li key={block.id}>{block.blocked.nickname}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="space-y-3 pt-2">
        <form action="/api/auth/logout" method="post">
          <Button className="w-full" type="submit" variant="outline">
            Log out
          </Button>
        </form>
        <Link className="block text-center text-sm text-muted-foreground hover:text-foreground" href="/reports">
          My reports
        </Link>
      </div>
    </div>
  );
}
