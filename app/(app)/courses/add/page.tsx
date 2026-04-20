import { CourseForm } from "@/components/forms/course-form";
import { requireOnboardedUser } from "@/lib/auth/guards";

export default async function AddCoursePage() {
  await requireOnboardedUser();

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold tracking-tight">Add a TUM course</h1>
      <CourseForm />
    </div>
  );
}
