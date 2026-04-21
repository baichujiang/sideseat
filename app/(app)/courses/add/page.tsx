import Link from "next/link";

import { CourseForm } from "@/components/forms/course-form";
import { requireOnboardedUser } from "@/lib/auth/guards";

export default async function AddCoursePage() {
  await requireOnboardedUser();

  return (
    <div className="space-y-5">
      <Link className="text-xs text-muted-foreground hover:text-foreground" href="/courses">
        ← Courses
      </Link>
      <CourseForm />
    </div>
  );
}
