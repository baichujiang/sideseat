import { AppShell } from "@/components/layout/app-shell";
import { getSessionUser } from "@/lib/auth/session";
import { isConfiguredAdmin } from "@/lib/constants/app";
import { getInboxUnreadTotal } from "@/lib/queries/inbox-merge";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessionUser = await getSessionUser();
  const inboxUnreadTotal = sessionUser ? await getInboxUnreadTotal(sessionUser.id) : 0;

  const productTutorialContext = sessionUser
    ? {
        userId: sessionUser.id,
        isGuest: sessionUser.isGuest,
        onboardingComplete: sessionUser.onboardingComplete,
        dbDismissed: sessionUser.productTutorialDismissedAt != null,
        skipAsAdmin: isConfiguredAdmin(sessionUser),
      }
    : null;

  return (
    <AppShell inboxUnreadTotal={inboxUnreadTotal} productTutorialContext={productTutorialContext}>
      {children}
    </AppShell>
  );
}
