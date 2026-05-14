"use client";

import type { SportTag } from "@prisma/client";
import { ChevronsUpDown, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { sportTagLabel } from "@/lib/discover/study-meta-labels";
import type { AppMessages } from "@/lib/i18n/messages";
import {
  CLASSMATE_POST_SPORT_OTHER_NOTE_MAX,
  SPORT_TAG_VALUES,
} from "@/lib/validators/classmate-posts";

function normalize(s: string) {
  return s.trim().toLowerCase();
}

const SPORT_PRESET_VALUES = SPORT_TAG_VALUES.filter((t): t is SportTag => t !== "OTHER");

function tryMatchPresetFromQuery(query: string, dl: AppMessages["discoverList"]): SportTag | undefined {
  const q = query.trim();
  if (!q) return undefined;
  const n = normalize(q);
  for (const tag of SPORT_PRESET_VALUES) {
    if (normalize(sportTagLabel(tag, dl)) === n) return tag;
  }
  return undefined;
}

export function SportsPostFieldCombobox({
  dl,
  sportTags,
  sportOtherNote,
  onAddPresetTag,
  onRemovePresetTag,
  onSetCustomNote,
  onClearCustomNote,
}: {
  dl: AppMessages["discoverList"];
  sportTags: Set<SportTag>;
  sportOtherNote: string;
  onAddPresetTag: (tag: SportTag) => void;
  onRemovePresetTag: (tag: SportTag) => void;
  onSetCustomNote: (note: string) => void;
  onClearCustomNote: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = normalize(query);
    return SPORT_PRESET_VALUES.filter((tag) => {
      if (sportTags.has(tag)) return false;
      if (!q) return true;
      return normalize(sportTagLabel(tag, dl)).includes(q);
    });
  }, [dl, query, sportTags]);

  function commitFromInput() {
    const trimmed = query.trim().slice(0, CLASSMATE_POST_SPORT_OTHER_NOTE_MAX);
    if (!trimmed) return;
    const matched = tryMatchPresetFromQuery(query, dl);
    if (matched && !sportTags.has(matched)) {
      onAddPresetTag(matched);
      setQuery("");
      setOpen(false);
      return;
    }
    if (matched && sportTags.has(matched)) {
      setQuery("");
      setOpen(false);
      return;
    }
    onSetCustomNote(trimmed);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border/70 bg-card/50 px-3 py-2.5">
      <div className="space-y-1">
        <p className="text-[11px] font-medium text-muted-foreground">{dl.postSheetSportsLabel}</p>
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setQuery("");
          }}
        >
          <PopoverAnchor asChild>
            <div className="flex gap-1.5">
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (!open) setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (filtered.length === 1) {
                      onAddPresetTag(filtered[0]!);
                      setQuery("");
                      setOpen(false);
                      return;
                    }
                    commitFromInput();
                  }
                }}
                placeholder={dl.postSheetSportsComboboxPlaceholder}
                aria-expanded={open}
                autoComplete="off"
                className="h-9 flex-1 rounded-xl border-border/70 text-[13px]"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-xl border-border/70"
                aria-label={dl.postSheetSportsOpenPickerAria}
                onClick={() => setOpen((v) => !v)}
              >
                <ChevronsUpDown className="h-4 w-4 opacity-60" />
              </Button>
            </div>
          </PopoverAnchor>
          <PopoverContent
            align="start"
            className="w-[var(--radix-popover-trigger-width)] max-h-[min(240px,45vh)] overflow-y-auto p-1"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            {filtered.length === 0 ? (
              <p className="px-2 py-2 text-center text-[12px] text-muted-foreground">
                {dl.postSheetSportsComboboxEmpty}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {filtered.map((tag) => (
                  <li key={tag}>
                    <button
                      type="button"
                      className="flex w-full rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      onClick={() => {
                        onAddPresetTag(tag);
                        setQuery("");
                        setOpen(false);
                      }}
                    >
                      {sportTagLabel(tag, dl)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </PopoverContent>
        </Popover>
        <p className="text-[11px] leading-snug text-muted-foreground">{dl.postSheetSportsComboboxHint}</p>
      </div>

      {sportTags.size > 0 || sportOtherNote.trim() ? (
        <div className="flex flex-wrap gap-1">
          {[...sportTags].map((tag) => (
            <span
              key={tag}
              className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-rose-200/85 bg-rose-50/90 py-0.5 pl-2 pr-0.5 text-[11px] font-medium text-rose-950 dark:border-rose-500/35 dark:bg-rose-950/40 dark:text-rose-100"
            >
              <span className="min-w-0 truncate">{sportTagLabel(tag, dl)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-rose-800 hover:bg-rose-100 hover:text-rose-950 dark:text-rose-100 dark:hover:bg-rose-900/50"
                aria-label={dl.postSheetLanguageRemoveTagAria.replace("{label}", sportTagLabel(tag, dl))}
                onClick={() => onRemovePresetTag(tag)}
              >
                <X className="h-3 w-3" />
              </Button>
            </span>
          ))}
          {sportOtherNote.trim() ? (
            <span className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-border/80 bg-muted/50 py-0.5 pl-2 pr-0.5 text-[11px] font-medium text-foreground">
              <span className="min-w-0 truncate">{sportOtherNote.trim()}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={dl.postSheetLanguageRemoveTagAria.replace("{label}", sportOtherNote.trim())}
                onClick={() => onClearCustomNote()}
              >
                <X className="h-3 w-3" />
              </Button>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
