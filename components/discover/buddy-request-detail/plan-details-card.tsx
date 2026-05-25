export type BuddyPlanRow = { label: string; value: string };

export function PlanDetailsCard({ title, rows }: { title: string; rows: BuddyPlanRow[] }) {
  return (
    <section
      data-testid="plan-details-card"
      className="rounded-2xl border border-border/70 bg-card/50 px-4 py-3"
    >
      <h2 className="mb-2.5 text-[11px] font-medium text-muted-foreground">{title}</h2>
      <dl className="space-y-2.5">
        {rows.map((r) => (
          <div key={`${r.label}-${r.value}`} className="flex gap-2.5">
            <dt className="shrink-0 text-[11px] font-medium text-muted-foreground sm:w-24">{r.label}</dt>
            <dd className="min-w-0 text-[14px] leading-snug text-foreground">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
