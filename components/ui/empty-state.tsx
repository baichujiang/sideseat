import { Card, CardDescription, CardTitle } from "@/components/ui/card";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="space-y-3 border-dashed border-border/80 bg-muted/30 px-2 py-6 text-center shadow-none sm:px-4">
      <CardTitle className="text-base">{title}</CardTitle>
      {description ? (
        <CardDescription className="mx-auto max-w-sm leading-relaxed">
          {description}
        </CardDescription>
      ) : null}
      {action ? <div className="flex justify-center pt-1">{action}</div> : null}
    </Card>
  );
}
