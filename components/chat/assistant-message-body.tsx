"use client";

import Link from "next/link";
import type { Route } from "next";

import { parseAssistantMessage } from "@/lib/assistant/message-payload";
import { cn } from "@/lib/utils";

export function AssistantMessageBody({
  rawBody,
  className,
}: {
  rawBody: string;
  className?: string;
}) {
  const { text, links } = parseAssistantMessage(rawBody);

  return (
    <div className={cn("space-y-2.5", className)}>
      <p className="whitespace-pre-wrap break-words">{text}</p>
      {links.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {links.map((link) => (
            <Link
              key={`${link.href}:${link.label}`}
              href={link.href as Route}
              className="inline-flex min-h-8 items-center rounded-full border border-rose-200/80 bg-rose-50/90 px-3 py-1 text-[12px] font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 active:opacity-90 dark:border-rose-500/35 dark:bg-rose-950/40 dark:text-rose-200 dark:hover:bg-rose-950/60"
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
