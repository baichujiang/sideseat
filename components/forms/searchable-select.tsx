"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Lightweight combobox: a button shows the current value, clicking opens a
 * popover with a search input + filtered list. Used for majors so users can
 * type a few letters instead of scrolling 100+ options.
 */
export function SearchableSelect({
  value,
  options,
  placeholder = "Choose…",
  disabled,
  onChange,
}: {
  value: string;
  options: readonly string[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((opt) => opt.toLowerCase().includes(normalized));
  }, [options, query]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  // Keep the highlighted row in view while keyboard-navigating.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const item = listRef.current.children[highlight] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  function commit(option: string) {
    onChange(option);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center justify-between rounded-xl border border-border bg-background px-3 text-left text-sm disabled:opacity-50"
      >
        <span className={value ? "truncate" : "truncate text-muted-foreground"}>
          {value || placeholder}
        </span>
        <span aria-hidden className="ml-2 text-xs text-muted-foreground">
          ▾
        </span>
      </button>
      {open ? (
        <div className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setHighlight((h) => Math.min(h + 1, filtered.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                if (filtered[highlight]) commit(filtered[highlight]);
              } else if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
                setQuery("");
              }
            }}
            placeholder="Search…"
            className="block w-full border-b border-border bg-background px-3 py-2 text-sm outline-none"
          />
          <ul ref={listRef} className="max-h-56 overflow-y-auto py-1">
            {filtered.length ? (
              filtered.map((opt, index) => {
                const isHighlight = index === highlight;
                const isCurrent = opt === value;
                return (
                  <li key={opt}>
                    <button
                      type="button"
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => commit(opt)}
                      className={`block w-full px-3 py-2 text-left text-sm ${
                        isHighlight ? "bg-muted" : ""
                      } ${isCurrent ? "font-medium" : ""}`}
                    >
                      {opt}
                    </button>
                  </li>
                );
              })
            ) : (
              <li className="px-3 py-3 text-sm text-muted-foreground">No matches.</li>
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
