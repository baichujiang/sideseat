import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { getSchoolLabel } from "@/lib/constants/schools";

export function CourseCard({
  course,
  intentions,
  memberCount,
}: {
  course: {
    id: string;
    name: string;
    code?: string | null;
    school: string;
    semesterLabel: string;
    location?: string | null;
    schedule?: string | null;
  };
  intentions: string[];
  memberCount?: number;
}) {
  return (
    <Card className="space-y-4">
      <div className="space-y-1">
        <CardTitle>
          {course.code ? <span className="mr-2 text-muted-foreground">{course.code}</span> : null}
          {course.name}
        </CardTitle>
        <CardDescription>
          {getSchoolLabel(course.school)} · {course.semesterLabel}
        </CardDescription>
      </div>
      <div className="flex flex-wrap gap-2">
        {intentions.map((intention) => (
          <Badge key={intention}>{intention.toLowerCase().replaceAll("_", " ")}</Badge>
        ))}
      </div>
      <div className="text-sm text-muted-foreground">
        {[course.location, course.schedule, memberCount ? `${memberCount} people` : null]
          .filter(Boolean)
          .join(" · ")}
      </div>
      <LinkButton className="w-full" href={`/courses/${course.id}`}>
        Open course
      </LinkButton>
    </Card>
  );
}
