import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { WebLogin } from "@/components/web/web-login";
import { safeReturnPath } from "@/lib/nav/back";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const query = await searchParams;
  const candidate = safeReturnPath(query.returnTo, "/web/together");
  const target =
    candidate.startsWith("/web/") &&
    !candidate.startsWith("/web/login") &&
    !candidate.startsWith("/web/signup")
      ? candidate
      : "/web/together";
  const user = await getSessionUser();
  if (user && !user.isGuest) redirect(target as "/web/together");
  let localPreview = false;
  if (process.env.NODE_ENV === "development") {
    try {
      localPreview = ["127.0.0.1", "localhost", "[::1]"].includes(new URL(process.env.DATABASE_URL ?? "").hostname);
    } catch { /* Missing configuration retains the normal login error flow. */ }
  }
  return <WebLogin returnTo={target} localPreview={localPreview} />;
}
