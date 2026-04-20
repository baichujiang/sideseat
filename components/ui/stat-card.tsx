import { Card, CardDescription } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card className="space-y-1 bg-[rgba(255,255,255,0.8)] p-4">
      <CardDescription className="text-xs uppercase tracking-[0.18em]">{label}</CardDescription>
      <div className="text-2xl font-semibold text-foreground">{value}</div>
      {hint ? <CardDescription>{hint}</CardDescription> : null}
    </Card>
  );
}
