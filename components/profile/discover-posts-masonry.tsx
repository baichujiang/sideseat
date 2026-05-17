"use client";

import type { ReactNode } from "react";

export function DiscoverPostsMasonry({ children }: { children: ReactNode }) {
  return <div className="columns-2 gap-2.5 sm:gap-3 [column-fill:balance]">{children}</div>;
}

export function DiscoverPostsMasonryItem({ children }: { children: ReactNode }) {
  return <div className="mb-2.5 break-inside-avoid sm:mb-3">{children}</div>;
}
