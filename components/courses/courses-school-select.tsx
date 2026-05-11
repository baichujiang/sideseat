"use client";

import { useRef } from "react";
import type { Route } from "next";
import { ChevronDown } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAppMessages } from "@/hooks/use-app-locale";
import { schoolOptions, type SchoolCode } from "@/lib/constants/schools";
import { formatMessage } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

type Props = {
  value: SchoolCode;
  id?: string;
  className?: string;
};

/**
 * School scope for /courses.
 * Closed state shows short label (e.g. TUM); expanded list shows full labels.
 */
export function CoursesSchoolSelect({ value, id = "courses-school-select", className }: Props) {
  const router = useRouter();
  const { courses: co } = useAppMessages();
  const searchParams = useSearchParams();
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const selected = schoolOptions.find((s) => s.value === value) ?? schoolOptions[0];

  function navigate(next: SchoolCode) {
    detailsRef.current?.removeAttribute("open");
    const params = new URLSearchParams(searchParams.toString());
    params.set("school", next);
    const url = `/courses?${params.toString()}` as Route;
    router.push(url);
  }

  return (
    <details ref={detailsRef} className={cn("relative w-full max-w-[11.5rem] shrink-0", className)}>
      <summary
        id={id}
        aria-label={formatMessage(co.schoolFilterAria, { label: selected?.shortLabel ?? value })}
        className={cn(
          "inline-flex h-10 w-full cursor-pointer list-none select-none items-center justify-between gap-2 rounded-full border border-[#E7E0D6] bg-white px-3 text-[13px] font-semibold text-foreground shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)] transition",
          "hover:border-[#D8D1C7] hover:bg-muted/35 active:bg-muted/50",
          "[&::-webkit-details-marker]:hidden",
          "dark:border-border dark:bg-card dark:hover:bg-muted/30",
        )}
      >
        <span className="truncate">{selected?.shortLabel ?? value}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2.25} aria-hidden />
      </summary>

      <div className="absolute right-0 z-30 mt-1.5 min-w-[16rem] overflow-hidden rounded-xl border border-[#E7E0D6] bg-white py-1 shadow-lg dark:border-border dark:bg-card">
        {schoolOptions.map((school) => (
          <button
            key={school.value}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              navigate(school.value);
            }}
            className={cn(
              "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] transition",
              school.value === value
                ? "bg-[#EFF6FF] font-semibold text-[#1D4ED8] dark:bg-blue-950/35 dark:text-blue-300"
                : "text-foreground hover:bg-muted/45",
            )}
          >
            <span className="truncate">{school.label}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">{school.shortLabel}</span>
          </button>
        ))}
      </div>
    </details>
  );
}
