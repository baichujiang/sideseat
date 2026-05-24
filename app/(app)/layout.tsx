import { AppShell } from "@/components/layout/app-shell";
import { getSessionUser } from "@/lib/auth/session";
import { isConfiguredAdmin } from "@/lib/constants/app";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessionUser = await getSessionUser();

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
    <AppShell productTutorialContext={productTutorialContext}>
      {children}
    </AppShell>
  );
}
