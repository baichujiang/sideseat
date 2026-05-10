"use client";

import { useEffect, useRef } from "react";
import { ClassmatePostInsightKind } from "@prisma/client";

import { apiFetch } from "@/lib/auth/api-fetch";

/** Records one deduplicated detail view for the current user (author excluded server-side). */
export function ClassmatePostDetailViewBeacon({ postId }: { postId: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void apiFetch(`/api/classmate-posts/${postId}/insights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: ClassmatePostInsightKind.DETAIL_VIEW }),
    });
  }, [postId]);
  return null;
}
