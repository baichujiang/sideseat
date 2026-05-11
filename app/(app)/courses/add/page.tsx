import { CourseForm } from "@/components/forms/course-form";
import { BackLink } from "@/components/nav/back-link";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import { safeReturnPath } from "@/lib/nav/back";

export default async function AddCoursePage({
  searchParams,
}: {
  searchParams?: Promise<{ prefillCourseId?: string; returnTo?: string }>;
}) {
  await requireOnboardedUser();
  const locale = await getServerAppLocale();
  const ui = getMessages(locale);
  const c = ui.courses;
  const q = (await searchParams) ?? {};
  const prefill = q.prefillCourseId?.trim() || null;
  const backHref = safeReturnPath(q.returnTo, "/courses");

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-2">
        <BackLink href={backHref} label={c.backToCourses} />
        <h1 className="page-screen-title-ink">{c.addCourseTitle}</h1>
      </header>
      <CourseForm key={prefill ?? "none"} prefillCourseId={prefill} />
    </div>
  );
}
