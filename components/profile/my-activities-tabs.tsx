"use client";

import Link from "next/link";
import type { Route } from "next";

import type { AppMessages } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

export function MyActivitiesTabs({
  active,
  labels,
}: {
  active: "organized" | "joined";
  labels: Pick<
    AppMessages["discoverActivity"],
    "myActivitiesTabOrganized" | "myActivitiesTabJoined"
  >;
}) {
  const tabs = [
    { id: "organized" as const, label: labels.myActivitiesTabOrganized, href: "/profile/my-activities" },
    {
      id: "joined" as const,
      label: labels.myActivitiesTabJoined,
      href: "/profile/my-activities?tab=joined",
    },
  ];

  return (
    <div className="flex gap-2">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.href as Route}
            className={cn(
              "inline-flex h-9 flex-1 items-center justify-center rounded-full border text-[13px] font-medium transition",
              isActive
                ? "border-classmates-blue-border bg-classmates-blue-soft text-classmates-blue"
                : "border-border/80 bg-card text-muted-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
