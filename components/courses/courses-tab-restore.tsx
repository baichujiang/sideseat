"use client";

import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import {
  DEFAULT_COURSES_TAB,
  normalizeCoursesTab,
  readStoredCoursesTab,
  writeStoredCoursesTab,
} from "@/lib/courses/courses-tab";

/**
 * When `/courses` loads without `?tab=`, restore the last tab via replace
 * (no extra history entry). When `?tab=` is present, persist it for bottom nav.
 */
export function CoursesTabRestore() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const restoredRef = useRef(false);

  useEffect(() => {
    const tabParam = searchParams.get("tab");

    if (tabParam) {
      writeStoredCoursesTab(normalizeCoursesTab(tabParam));
      return;
    }

    if (restoredRef.current) return;
    restoredRef.current = true;

    const stored = readStoredCoursesTab();
    if (stored === DEFAULT_COURSES_TAB) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", stored);
    router.replace(`/courses?${params.toString()}` as Route, { scroll: false });
  }, [router, searchParams]);

  return null;
}
