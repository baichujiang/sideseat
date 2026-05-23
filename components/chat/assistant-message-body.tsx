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
    <div className={cn("space-y-2", className)}>
      <p className="whitespace-pre-wrap break-words">{text}</p>
      {links.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href as Route}
              className="inline-flex min-h-8 items-center rounded-full border border-border/80 bg-background/90 px-3 py-1 text-[12px] font-semibold text-classmates-azure shadow-sm transition hover:bg-muted/80 active:opacity-90 dark:border-border dark:bg-card"
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
