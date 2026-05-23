"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { AppPushLayer } from "@/components/ui/app-push-layer";
import { chatComposerIconBtnClassName } from "@/components/chat/chat-composer-chrome";
import { useAppMessages } from "@/hooks/use-app-locale";
import { chatMessageDomId } from "@/lib/chat/chat-message-dom-id";
import type { ThreadSearchEntry } from "@/lib/chat/thread-search-index";
import { cn } from "@/lib/utils";

const searchIconBtnClass = cn(
  chatComposerIconBtnClassName,
  "mb-0 h-10 w-10 border border-border/70 bg-background/95 shadow-sm",
  "hover:border-border hover:bg-muted/60",
);

export function ChatThreadSearchButton({ entries }: { entries: ThreadSearchEntry[] }) {
  const { chat } = useAppMessages();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const trimmed = q.trim().toLowerCase();
  const hits = useMemo(() => {
    if (!trimmed) return [];
    return entries.filter((e) => e.preview.toLowerCase().includes(trimmed));
  }, [entries, trimmed]);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      const el = document.querySelector<HTMLInputElement>("#chat-thread-search-input");
      el?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  const close = () => {
    setOpen(false);
    setQ("");
  };

  const jumpTo = (messageId: string) => {
    const el = document.getElementById(chatMessageDomId(messageId));
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    close();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={chat.searchThreadAria}
        className={searchIconBtnClass}
      >
        <Search className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} aria-hidden />
      </button>

      <AppPushLayer open={open} onClose={close} ariaLabelledBy="chat-thread-search-title">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 px-3 py-3">
            <h2 id="chat-thread-search-title" className="truncate text-base font-semibold text-foreground">
              {chat.searchThreadTitle}
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label={chat.searchThreadCloseAria}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <X className="h-5 w-5" strokeWidth={2.25} aria-hidden />
            </button>
          </div>

          <div className="shrink-0 px-3 pt-3">
            <div
              className="flex items-center gap-3 rounded-2xl border border-border bg-muted/30 px-4 py-2.5"
              role="search"
            >
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={2.25} aria-hidden />
              <input
                id="chat-thread-search-input"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={chat.searchThreadPlaceholder}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label={chat.searchThreadAria}
                className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-3">
            {!trimmed ? (
              <p className="px-1 text-sm text-muted-foreground">{chat.searchThreadHint}</p>
            ) : hits.length === 0 ? (
              <p className="px-1 text-sm text-muted-foreground">{chat.searchThreadNoMatches}</p>
            ) : (
              <ul className="space-y-1">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => jumpTo(h.id)}
                      className={cn(
                        "w-full rounded-xl px-3 py-2.5 text-left text-sm leading-snug transition",
                        "hover:bg-muted/80 active:bg-muted",
                      )}
                    >
                      <span className="line-clamp-3 text-foreground">{h.preview}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </AppPushLayer>
    </>
  );
}
