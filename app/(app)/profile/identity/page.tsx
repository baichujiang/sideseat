import { redirect } from "next/navigation";

import { BackLink } from "@/components/nav/back-link";
import { ProfileIdentitySheets } from "@/components/profile/profile-identity-sheets";
import { getSessionUser } from "@/lib/auth/session";
import { DEGREE_LEVEL_LABELS } from "@/lib/constants/majors";
import { DEFAULT_SCHOOL, normalizeSchoolCode, schoolOptions } from "@/lib/constants/schools";

export default async function ProfileIdentityPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const schoolCode = normalizeSchoolCode(user.school) ?? DEFAULT_SCHOOL;
  const schoolShort = schoolOptions.find((s) => s.value === schoolCode)?.shortLabel ?? schoolCode;

  return (
    <div className="space-y-5 pb-2">
      <header className="flex items-center gap-2 px-0.5">
        <BackLink fallback="/profile" label="Back" />
        <div>
          <h1 className="page-screen-title-ink">Identity</h1>
        </div>
      </header>

      <ProfileIdentitySheets
        variant="hero"
        gender={user.gender}
        schoolSummary={{
          schoolShort,
          degreeLabel: DEGREE_LEVEL_LABELS[user.degreeLevel ?? "BACHELOR"],
          major: user.major?.trim() ?? "",
          semester: user.semester ?? 1,
        }}
        initialAvatarUrl={user.avatarUrl}
        initialBio={user.bio}
        initialNickname={user.nickname}
        loginUsername={user.username}
      />
    </div>
  );
}
