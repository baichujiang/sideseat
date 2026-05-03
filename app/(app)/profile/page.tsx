import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, ShieldBan } from "lucide-react";

import { GuestAppCta } from "@/components/app/guest-app-cta";
import { StudentVerificationForm } from "@/components/forms/student-verification-form";
import { ProfileIdentitySheets } from "@/components/profile/profile-identity-sheets";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "@/components/forms/profile-form";
import { getSessionUser } from "@/lib/auth/session";
import { adminEmails } from "@/lib/constants/app";
import { DEFAULT_SCHOOL, normalizeSchoolCode } from "@/lib/constants/schools";
import { getSchoolVerificationHint } from "@/lib/constants/verification";
import { prisma } from "@/lib/db/prisma";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams?: Promise<{ verification?: string }>;
}) {
  const sessionUser = await getSessionUser();
  const query = (await searchParams) ?? {};

  if (!sessionUser) {
    return (
      <div className="space-y-6 pb-2">
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Me</h1>
        </header>
        <GuestAppCta
          returnTo="/profile"
          headline="Sign in to your profile"
          body="Edit your courses, verification, and how classmates find you."
        />
      </div>
    );
  }
  if (!sessionUser.onboardingComplete) {
    redirect("/onboarding");
  }
  const user = sessionUser;

  if (user.isGuest) {
    return (
      <div className="space-y-6">
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

  const blockedCount = await prisma.block.count({
    where: { blockerId: user.id },
  });
  const isAdmin = Boolean(user.email && adminEmails.includes(user.email.toLowerCase()));
  const formKey = `${user.id}-${user.updatedAt.getTime()}`;

  return (
    <div className="space-y-6 pb-2">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Me</h1>
      </header>

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
            className="rounded-full bg-[#eceaf5] px-3 py-1.5 text-xs font-semibold text-[#3f3473]"
            href="/admin/users"
          >
            Users
          </Link>
        </div>
      ) : null}

      <section aria-labelledby="section-display">
        <h2 id="section-display" className="sr-only">
          Profile
        </h2>
        <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
          <ProfileIdentitySheets
            initialAvatarUrl={user.avatarUrl}
            initialBio={user.bio}
            initialNickname={user.nickname}
          />
        </div>
      </section>

      <section aria-labelledby="section-academic">
        <h2 id="section-academic" className="sr-only">
          School and program
        </h2>
        <div>
          <ProfileForm
            key={formKey}
            submitLabel="Save"
            variant="academicOnly"
            avatarId={user.avatarUrl}
            verificationSlot={
              <StudentVerificationForm
                currentStatus={user.studentVerificationStatus}
                schoolHint={getSchoolVerificationHint(user.school)}
                notes={user.studentVerificationNotes}
                email={user.email}
                hasProofUploaded={Boolean(user.manualReviewProofUrl)}
              />
            }
            initialValues={{
              nickname: user.nickname ?? "",
              school: normalizeSchoolCode(user.school) ?? DEFAULT_SCHOOL,
              degreeLevel: user.degreeLevel ?? "BACHELOR",
              major: user.major ?? "",
              semester: user.semester ?? 1,
              bio: user.bio ?? "",
              wechatHandle: user.wechatHandle ?? "",
              whatsappHandle: user.whatsappHandle ?? "",
              telegramHandle: user.telegramHandle ?? "",
              instagramHandle: user.instagramHandle ?? "",
            }}
          />
        </div>
      </section>

      <Link
        href="/profile/blocked"
        className="flex items-center justify-between gap-3 rounded-[1.125rem] border border-border/60 bg-card px-4 py-3 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)] transition-colors active:bg-muted/40 [@media(hover:hover)]:hover:bg-muted/30"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
            <ShieldBan className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <div>
            <p className="text-[14px] font-semibold leading-tight">Blocked users</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {blockedCount === 0
                ? "No blocked users"
                : `${blockedCount} blocked user${blockedCount === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/50" strokeWidth={2} aria-hidden />
      </Link>

      <section className="border-t border-border/60 pt-4">
        <form action="/api/auth/logout" method="post">
          <Button className="w-full" type="submit" variant="outline">
            Log out
          </Button>
        </form>
      </section>
    </div>
  );
}
