import Link from "next/link";
import type { Route } from "next";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { mePageChevronClass, mePageRowInteractiveClass } from "@/components/profile/me-settings-row";
import { cn } from "@/lib/utils";

/** Profile Me list row: left label, right value, navigates to edit subpage. */
export function ProfileInfoRow({
  href,
  title,
  value,
  valueClassName,
}: {
  href: Route;
  title: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <Link href={href} className={mePageRowInteractiveClass}>
      <span className="shrink-0 text-[15px] font-medium text-foreground">{title}</span>
      <span className="flex min-w-0 max-w-[58%] items-center justify-end gap-1.5">
        {typeof value === "string" || typeof value === "number" ? (
          <span
            className={cn(
              "min-w-0 truncate text-right text-[14px] text-muted-foreground",
              valueClassName,
            )}
          >
            {value}
          </span>
        ) : (
          <span className={cn("shrink-0", valueClassName)}>{value}</span>
        )}
        <ChevronRight className={mePageChevronClass} strokeWidth={2} aria-hidden />
      </span>
    </Link>
  );
}
