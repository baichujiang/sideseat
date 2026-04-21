import { ProfileForm } from "@/components/forms/profile-form";
import { DEFAULT_SCHOOL, normalizeSchoolCode } from "@/lib/constants/schools";
import { requireUser } from "@/lib/auth/session";

export default async function OnboardingPage() {
  const user = await requireUser();

  return (
    <div className="space-y-5">
      <ProfileForm
        submitLabel="Save profile and continue"
        avatarId={user.avatarUrl}
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
    </div>
  );
}
