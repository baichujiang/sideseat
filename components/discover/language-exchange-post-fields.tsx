"use client";

import type { LanguageProficiency, LanguageTag } from "@prisma/client";
import { ChevronsUpDown, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { languageProficiencyLabel, languageTagLabel } from "@/lib/discover/study-meta-labels";
import { formatMessage, type AppMessages } from "@/lib/i18n/messages";
import { LANGUAGE_PROFICIENCY_VALUES, LANGUAGE_TAG_VALUES } from "@/lib/validators/classmate-posts";
import { cn } from "@/lib/utils";

function normalize(s: string) {
  return s.trim().toLowerCase();
}

function LanguageTagPickerRow({
  dl,
  fieldLabel,
  placeholder,
  selected,
  onPick,
  maxTags,
  variant,
}: {
  dl: AppMessages["discoverList"];
  fieldLabel: string;
  placeholder: string;
  selected: Set<LanguageTag>;
  onPick: (tag: LanguageTag) => void;
  maxTags: number;
  variant: "offer" | "practice";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = normalize(query);
    return LANGUAGE_TAG_VALUES.filter((tag) => {
      if (selected.has(tag)) return false;
      if (!q) return true;
      return normalize(languageTagLabel(tag, dl)).includes(q);
    });
  }, [dl, query, selected]);

  const canAddMore = selected.size < maxTags;

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium text-muted-foreground">{fieldLabel}</p>
      <Popover
        open={open && canAddMore}
        onOpenChange={(next) => {
          setOpen(next && canAddMore);
          if (!next) setQuery("");
        }}
      >
        <PopoverAnchor asChild>
          <div className="flex gap-1.5">
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (!open && canAddMore) setOpen(true);
              }}
              onFocus={() => {
                if (canAddMore) setOpen(true);
              }}
              placeholder={placeholder}
              disabled={!canAddMore}
              aria-expanded={open}
              autoComplete="off"
              className="h-9 flex-1 rounded-xl border-border/70 text-[13px]"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={!canAddMore}
              className="h-9 w-9 shrink-0 rounded-xl border-border/70"
              aria-label={dl.postSheetLanguageOpenPickerAria}
              onClick={() => setOpen((v) => !v)}
            >
              <ChevronsUpDown className="h-4 w-4 opacity-60" />
            </Button>
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="max-h-[min(240px,45vh)] w-[var(--radix-popover-trigger-width)] overflow-y-auto p-1 sm:min-w-[12rem]"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {filtered.length === 0 ? (
            <p className="px-2 py-2 text-center text-[12px] text-muted-foreground">
              {dl.postSheetLanguageComboboxEmpty}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((tag) => (
                <li key={tag}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors",
                      variant === "offer"
                        ? "hover:bg-classmates-blue-soft/80"
                        : "hover:bg-violet-50 dark:hover:bg-violet-950/40",
                    )}
                    onClick={() => {
                      onPick(tag);
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    {languageTagLabel(tag, dl)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function LanguageExchangePostFields({
  dl,
  languageOfferTags,
  languageOfferLevels,
  languageTargets,
  defaultOfferProficiency,
  toggleLanguageOffer,
  setLanguageOfferLevel,
  toggleLanguageTarget,
}: {
  dl: AppMessages["discoverList"];
  languageOfferTags: Set<LanguageTag>;
  languageOfferLevels: Partial<Record<LanguageTag, LanguageProficiency>>;
  languageTargets: Set<LanguageTag>;
  defaultOfferProficiency: LanguageProficiency;
  toggleLanguageOffer: (tag: LanguageTag) => void;
  setLanguageOfferLevel: (tag: LanguageTag, proficiency: LanguageProficiency) => void;
  toggleLanguageTarget: (tag: LanguageTag) => void;
}) {
  const max = LANGUAGE_TAG_VALUES.length;

  function pickOffer(tag: LanguageTag) {
    if (!languageOfferTags.has(tag)) toggleLanguageOffer(tag);
  }

  function pickTarget(tag: LanguageTag) {
    if (!languageTargets.has(tag)) toggleLanguageTarget(tag);
  }

  function removeOffer(tag: LanguageTag) {
    if (languageOfferTags.has(tag)) toggleLanguageOffer(tag);
  }

  function removeTarget(tag: LanguageTag) {
    if (languageTargets.has(tag)) toggleLanguageTarget(tag);
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border/70 bg-card/50 px-3 py-2.5">
      <LanguageTagPickerRow
        dl={dl}
        fieldLabel={dl.postSheetLanguageOffersLabel}
        placeholder={dl.postSheetLanguageComboboxPlaceholder}
        selected={languageOfferTags}
        onPick={pickOffer}
        maxTags={max}
        variant="offer"
      />
      {languageOfferTags.size > 0 ? (
        <div className="space-y-1.5">
          {[...languageOfferTags].map((tag) => (
            <div
              key={tag}
              className="flex items-center gap-2 rounded-xl border border-border/70 bg-background px-2 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
                {languageTagLabel(tag, dl)}
              </span>
              <label className="sr-only">
                {languageTagLabel(tag, dl)} {dl.postSheetLanguageOfferLevelLabel}
              </label>
              <select
                value={languageOfferLevels[tag] ?? defaultOfferProficiency}
                onChange={(e) => setLanguageOfferLevel(tag, e.target.value as LanguageProficiency)}
                className="h-8 max-w-[min(140px,42vw)] shrink-0 rounded-lg border border-input bg-background px-1.5 text-[11px]"
              >
                {LANGUAGE_PROFICIENCY_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {languageProficiencyLabel(value, dl)}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={formatMessage(dl.postSheetLanguageRemoveTagAria, {
                  label: languageTagLabel(tag, dl),
                })}
                onClick={() => removeOffer(tag)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <LanguageTagPickerRow
        dl={dl}
        fieldLabel={dl.postSheetLanguageTargetsLabel}
        placeholder={dl.postSheetLanguageComboboxPlaceholder}
        selected={languageTargets}
        onPick={pickTarget}
        maxTags={max}
        variant="practice"
      />
      {languageTargets.size > 0 ? (
        <div className="flex flex-wrap gap-1">
          {[...languageTargets].map((tag) => (
            <span
              key={tag}
              className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-violet-300/80 bg-violet-50 py-0.5 pl-2 pr-0.5 text-[11px] font-medium text-violet-800 dark:border-violet-500/35 dark:bg-violet-950/45 dark:text-violet-200"
            >
              <span className="min-w-0 truncate">{languageTagLabel(tag, dl)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-violet-700 hover:bg-violet-100 hover:text-violet-900 dark:text-violet-200 dark:hover:bg-violet-900/50"
                aria-label={formatMessage(dl.postSheetLanguageRemoveTagAria, {
                  label: languageTagLabel(tag, dl),
                })}
                onClick={() => removeTarget(tag)}
              >
                <X className="h-3 w-3" />
              </Button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
