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
}: {
  activeTab: CoursesTab;
  selectedSchool: SchoolCode;
  query: string;
  courses: CoursesMessages;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const base =
    "inline-flex h-9 w-full items-center justify-center rounded-full border px-2 text-[12px] font-semibold transition";

  const tabClass = (tab: CoursesTab) =>
    cn(
      base,
      activeTab === tab
        ? "border-[#2563EB]/30 bg-[#EFF6FF] text-[#1D4ED8]"
        : "border-[#D8D1C7] bg-white text-[#111827] shadow-sm hover:bg-[#F8F6F1] dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted/45",
    );

  function selectTab(tab: CoursesTab) {
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
    <nav aria-label={courses.tabsNavAria} className="grid grid-cols-3 items-center gap-2">
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          aria-current={activeTab === id ? "page" : undefined}
          onClick={() => selectTab(id)}
          className={tabClass(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
