"use client";

import type { ReactNode } from "react";

import { ClassmatePostSaveButton } from "@/components/discover/classmate-post-save-button";
import { cn } from "@/lib/utils";

export function ClassmatePostDetailHeaderActions({
  postId,
  initialSaved,
  trailing,
}: {
  postId: string;
  initialSaved: boolean;
  /** e.g. author share menu */
  trailing?: ReactNode;
}) {
  return (
    <div className={cn("flex items-center gap-1")}>
      <ClassmatePostSaveButton postId={postId} initialSaved={initialSaved} />
      {trailing}
    </div>
  );
}
