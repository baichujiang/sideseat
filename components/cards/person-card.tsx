import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { getSchoolLabel } from "@/lib/constants/schools";
import { formatSemester } from "@/lib/utils";

type MatchReason = {
  label: string;
};

export function PersonCard({
  nickname,
  school,
  major,
  semester,
  bio,
  reasons,
  footer,
}: {
  nickname: string;
  school?: string | null;
  major?: string | null;
  semester?: number | null;
  bio?: string | null;
  reasons: MatchReason[];
  footer?: React.ReactNode;
}) {
  return (
    <Card className="space-y-4">
      <div className="space-y-1">
        <CardTitle>{nickname}</CardTitle>
        <CardDescription>
          {[getSchoolLabel(school), major, formatSemester(semester)].filter(Boolean).join(" · ")}
        </CardDescription>
      </div>
      {bio ? <p className="text-sm italic text-muted-foreground">{bio}</p> : null}
      <div className="flex flex-wrap gap-2">
        {reasons.map((reason) => (
          <Badge key={reason.label}>{reason.label}</Badge>
        ))}
      </div>
      {footer}
    </Card>
  );
}
