"use client";

import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";

import { type CoursesTab, writeStoredCoursesTab } from "@/lib/courses/courses-tab";
import type { SchoolCode } from "@/lib/constants/schools";
import { type CoursesMessages } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

/**
 * Tab bar for `/courses`. Uses `router.replace` so switching tabs does not push
 * history entries — browser back leaves the screen instead of cycling tabs.
 */
export function CoursesEntryTabs({
  activeTab,
  selectedSchool,
  query,
  courses,
  disabled = false,
}: {
  activeTab: CoursesTab;
  selectedSchool: SchoolCode;
  query: string;
  courses: CoursesMessages;
  disabled?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabClass = (tab: CoursesTab) =>
    cn(
      "inline-flex h-8 min-w-0 flex-1 items-center justify-center rounded-[0.45rem] px-1.5 text-[12px] font-semibold leading-tight transition-[background-color,color,box-shadow] duration-200 ease-out",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-classmates-azure/50 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent",
      activeTab === tab
        ? "bg-white text-classmates-ink shadow-[0_1px_3px_rgba(15,23,42,0.08),0_0_0_0.5px_rgba(15,23,42,0.04)] dark:bg-card dark:text-foreground dark:shadow-[0_1px_3px_rgba(0,0,0,0.25)]"
        : "text-classmates-sub hover:text-classmates-ink dark:text-muted-foreground dark:hover:text-foreground",
    );

  function selectTab(tab: CoursesTab) {
    if (disabled) return;
    if (tab === activeTab) return;

    writeStoredCoursesTab(tab);

    const params = new URLSearchParams(searchParams.toString());
    params.set("school", selectedSchool);
    params.set("tab", tab);
    if (query.trim()) {
      params.set("q", query.trim());
    } else {
      params.delete("q");
    }

    router.replace(`/courses?${params.toString()}` as Route, { scroll: false });
  }

  const tabs: Array<{ id: CoursesTab; label: string }> = [
    { id: "popular-courses", label: courses.tabPopular },
    { id: "my-courses", label: courses.tabMyCourses },
    { id: "my-bookmarked-courses", label: courses.tabBookmarks },
  ];

  return (
    <nav
      aria-label={courses.tabsNavAria}
      role="tablist"
      className="grid grid-cols-3 items-stretch gap-0.5 rounded-[0.625rem] bg-classmates-rail/55 p-1 dark:bg-muted/55"
    >
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={activeTab === id}
          aria-current={activeTab === id ? "page" : undefined}
          onClick={() => selectTab(id)}
          disabled={disabled}
          className={cn(tabClass(id), disabled && "cursor-not-allowed opacity-65")}
        >
          <span className="truncate">{label}</span>
        </button>
      ))}
    </nav>
  );
}
