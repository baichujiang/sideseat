import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { isConfiguredAdmin } from "@/lib/constants/app";
import { MembershipInviteAdmin } from "@/components/admin/membership-invite-admin";

export const dynamic = "force-dynamic";
export default async function InvitationsPage() {
  const user = await getSessionUser();
  if (!user || user.isGuest) redirect("/login?returnTo=%2Fadmin%2Finvitations");
  if (!user.onboardingComplete || !isConfiguredAdmin(user)) return (
    <main className="mx-auto max-w-lg p-8"><h1 className="text-2xl font-semibold">需要管理员权限</h1><p className="mt-3 text-muted-foreground">当前账号无法查看或管理邀请码。</p><Link href="/ios" className="mt-6 inline-block underline">返回 SideSeat</Link></main>
  );
  return <MembershipInviteAdmin username={user.username} />;
}
