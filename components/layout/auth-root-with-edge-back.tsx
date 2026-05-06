"use client";

import { useCallback, useRef } from "react";

import { EdgeSwipeBack } from "@/components/layout/edge-swipe-back";

export function AuthRootWithEdgeBack({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const bounds = useCallback(() => ref.current?.getBoundingClientRect() ?? null, []);

  return (
    <div ref={ref} className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-8 sm:px-5">
      <EdgeSwipeBack getBounds={bounds} />
      {children}
    </div>
  );
}
