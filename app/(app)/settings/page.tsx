import { redirect } from "next/navigation";

/** Old path; tab and copy use “Profile” at `/profile`. */
export default async function SettingsRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<{ verification?: string }>;
}) {
  const q = (await searchParams) ?? {};
  const v = q.verification;
  if (v) {
    redirect(`/profile?verification=${encodeURIComponent(v)}`);
  }
  redirect("/profile");
}
