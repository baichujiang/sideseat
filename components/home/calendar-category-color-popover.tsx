"use client";

import { Check } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  calendarCategoryColorGridSwatches,
  hexToRgb,
  normalizeCalendarCategoryHex,
  rgbToHex,
} from "@/lib/calendar/calendar-category-colors";
import { cn } from "@/lib/utils";

type ColorMode = "grid" | "spectrum" | "custom";

const GRID_SWATCHES = calendarCategoryColorGridSwatches();

function ColorModeTabs({
  mode,
  onModeChange,
  labelId,
}: {
  mode: ColorMode;
  onModeChange: (m: ColorMode) => void;
  labelId: string;
}) {
  const tabs: { id: ColorMode; label: string }[] = [
    { id: "grid", label: "Grid" },
    { id: "spectrum", label: "Spectrum" },
    { id: "custom", label: "Custom" },
  ];
  return (
    <div
      role="tablist"
      aria-labelledby={labelId}
      className="flex rounded-full border border-border/70 bg-muted/30 p-0.5"
    >
      {tabs.map((t) => {
        const active = mode === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onModeChange(t.id)}
            className={cn(
              "min-h-10 min-w-0 flex-1 rounded-full px-1.5 text-center text-[12px] font-semibold leading-tight transition sm:text-[13px]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function ColorGrid({
  value,
  onPick,
}: {
  value: string;
  onPick: (hex: string) => void;
}) {
  const normalized = normalizeCalendarCategoryHex(value);
  return (
    <div
      className="grid grid-cols-12 gap-px rounded-md border border-border/40 bg-border/30 p-px"
      role="listbox"
      aria-label="Calendar colors"
    >
      {GRID_SWATCHES.map((hex, index) => {
        const selected = hex === normalized;
        return (
          <button
            key={`${hex}-${index}`}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => onPick(hex)}
            className={cn(
              "relative aspect-square w-full min-h-8 min-w-0 rounded-[2px] border border-black/10 outline-none transition active:scale-[0.97]",
              "focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              "dark:border-white/12",
              selected && "z-10 ring-2 ring-primary ring-offset-1 ring-offset-background",
            )}
            style={{ backgroundColor: hex }}
            title={hex}
            aria-label={`Color ${hex}`}
          >
            {selected ? (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="flex h-[42%] max-h-5 min-h-3 w-[42%] max-w-5 min-w-3 items-center justify-center rounded-full bg-black/40 text-white shadow-sm dark:bg-black/50">
                  <Check className="h-[55%] w-[55%] min-h-2 min-w-2" strokeWidth={3} aria-hidden />
                </span>
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function ColorSpectrum({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
}) {
  const hex = normalizeCalendarCategoryHex(value);
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-muted-foreground">
        Use your device color picker (often includes a wheel and sliders).
      </p>
      <label className="flex flex-col gap-2">
        <span className="sr-only">Spectrum color</span>
        <input
          type="color"
          value={hex}
          disabled={disabled}
          onChange={(e) => onChange(normalizeCalendarCategoryHex(e.target.value))}
          className={cn(
            "h-14 w-full cursor-pointer rounded-xl border border-border/60 bg-background disabled:cursor-not-allowed disabled:opacity-50",
            "[color-scheme:light] dark:[color-scheme:dark]",
          )}
        />
      </label>
      <div
        className="h-11 w-full rounded-xl border border-border/50 shadow-inner"
        style={{ backgroundColor: hex }}
        aria-hidden
      />
    </div>
  );
}

function ColorCustom({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
}) {
  const hex = normalizeCalendarCategoryHex(value);
  const { r, g, b } = useMemo(() => hexToRgb(hex), [hex]);
  const [hexDraft, setHexDraft] = useState(hex);

  useEffect(() => {
    setHexDraft(hex);
  }, [hex]);

  function commitHexDraft() {
    onChange(normalizeCalendarCategoryHex(hexDraft));
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {(
          [
            ["R", r, (v: number) => onChange(rgbToHex(v, g, b))],
            ["G", g, (v: number) => onChange(rgbToHex(r, v, b))],
            ["B", b, (v: number) => onChange(rgbToHex(r, g, v))],
          ] as const
        ).map(([ch, channel, apply]) => (
          <div key={ch} className="flex items-center gap-3">
            <span className="w-3 shrink-0 text-center text-[12px] font-bold tabular-nums text-muted-foreground">
              {ch}
            </span>
            <input
              type="range"
              min={0}
              max={255}
              value={channel}
              disabled={disabled}
              onChange={(e) => apply(Number(e.target.value))}
              className={cn(
                "min-h-11 flex-1 accent-primary disabled:opacity-50",
                "touch-pan-y",
              )}
              aria-valuetext={`${channel}`}
            />
            <span className="w-8 shrink-0 text-right text-[12px] tabular-nums text-foreground">{channel}</span>
          </div>
        ))}
      </div>
      <label className="block space-y-1">
        <span className="text-[12px] font-medium text-muted-foreground">Hex</span>
        <input
          type="text"
          value={hexDraft}
          disabled={disabled}
          onChange={(e) => setHexDraft(e.target.value.trim())}
          onBlur={commitHexDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitHexDraft();
          }}
          spellCheck={false}
          autoComplete="off"
          placeholder="#RRGGBB"
          className="h-11 w-full rounded-xl border border-border/60 bg-background px-3 font-mono text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50"
        />
      </label>
    </div>
  );
}

export function CalendarCategoryColorPopover({
  value,
  onChange,
  disabled,
  ariaLabel,
  triggerClassName,
  previewSizeClassName = "h-5 w-5",
}: {
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  /** Outer control hit area (keep ≥44px for touch). */
  triggerClassName?: string;
  /** Inner color disc size. */
  previewSizeClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ColorMode>("grid");
  const headingId = useId();

  useEffect(() => {
    if (open) setMode("grid");
  }, [open]);

  const hex = normalizeCalendarCategoryHex(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-expanded={open}
          className={cn(
            "relative flex shrink-0 items-center justify-center rounded-full outline-none transition",
            "focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "min-h-11 min-w-11",
            triggerClassName,
          )}
        >
          <span
            className={cn(
              "rounded-full border border-black/10 shadow-sm dark:border-white/15",
              previewSizeClassName,
            )}
            style={{ backgroundColor: hex }}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[min(calc(100vw-1.5rem),24.5rem)] p-3 sm:p-4"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="space-y-3">
          <p id={headingId} className="text-[13px] font-semibold text-foreground">
            Calendar color
          </p>
          <ColorModeTabs mode={mode} onModeChange={setMode} labelId={headingId} />

          {mode === "grid" ? (
            <ColorGrid
              value={value}
              onPick={(picked) => {
                onChange(picked);
                setOpen(false);
              }}
            />
          ) : null}
          {mode === "spectrum" ? (
            <ColorSpectrum value={value} onChange={onChange} disabled={disabled} />
          ) : null}
          {mode === "custom" ? (
            <ColorCustom value={value} onChange={onChange} disabled={disabled} />
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
