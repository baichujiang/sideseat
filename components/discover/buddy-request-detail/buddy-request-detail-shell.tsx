import type { ReactNode } from "react";

export function BuddyRequestDetailShell({
  children,
  bottomBar,
}: {
  children: ReactNode;
  bottomBar: ReactNode;
}) {
  return (
    <div
      data-testid="buddy-request-detail"
      className="space-y-4 pb-[calc(6.25rem+env(safe-area-inset-bottom))]"
    >
      {children}
      {bottomBar}
    </div>
  );
}
