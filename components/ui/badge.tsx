import * as React from "react";

import { cn } from "@/lib/utils";

export function Badge({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
