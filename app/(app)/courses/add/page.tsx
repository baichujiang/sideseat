import { CourseForm } from "@/components/forms/course-form";
import { BackLink } from "@/components/nav/back-link";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { safeReturnPath } from "@/lib/nav/back";

export default async function AddCoursePage({
  searchParams,
}: {
  searchParams?: Promise<{ prefillCourseId?: string; returnTo?: string }>;
}) {
  await requireOnboardedUser();
  const q = (await searchParams) ?? {};
  const prefill = q.prefillCourseId?.trim() || null;
  const backHref = safeReturnPath(q.returnTo, "/courses");

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-2">
        <BackLink href={backHref} label="Back to courses" />
        <h1 className="text-[17px] font-semibold leading-tight tracking-tight">Add course</h1>
      </header>
      <CourseForm key={prefill ?? "none"} prefillCourseId={prefill} />
    </div>
  );
}
