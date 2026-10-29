import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSessionUser } from "@/lib/auth/session";
import { WebShell } from "@/components/web/web-shell";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user || user.isGuest) {
    const target =
      (await headers()).get("x-sideseat-web-return-to") ?? "/web/together";
    redirect(`/web/login?returnTo=${encodeURIComponent(target)}`);
  }
  return (
    <WebShell
      user={{
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        school: user.school,
        verifiedStudent: user.verifiedStudent,
        onboardingComplete: user.onboardingComplete,
      }}
    >
      {children}
    </WebShell>
  );
}
