"use client";

import { RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

const NEW_IMAGE_GHOST_CLICK_GUARD_MS = 700;
const MIN_SCALE = 1;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.75;

type Point = { x: number; y: number };

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function pointerPoint(e: React.PointerEvent): Point {
  return { x: e.clientX, y: e.clientY };
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function ChatMessageImage({
  imageUrl,
  className,
}: {
  imageUrl: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const mountedAtRef = useRef(Date.now());
  const activePointersRef = useRef(new Map<number, Point>());
  const dragRef = useRef<{ pointerId: number; last: Point } | null>(null);
  const pinchRef = useRef<{ startDistance: number; startScale: number } | null>(null);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setScale(1);
    setOffset({ x: 0, y: 0 });
    activePointersRef.current.clear();
    dragRef.current = null;
    pinchRef.current = null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function zoomTo(nextScale: number) {
    const clamped = clampScale(nextScale);
    setScale(clamped);
    if (clamped === 1) setOffset({ x: 0, y: 0 });
  }

  function zoomBy(delta: number) {
    zoomTo(scale + delta);
  }

  function resetZoom() {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }

  const preview =
    open && portalReady && typeof document !== "undefined"
      ? createPortal(
          <div
            className={cn(
              "fixed inset-0 z-[200] flex h-dvh max-h-dvh w-full items-center justify-center",
              "bg-black/88 p-3",
            )}
            role="dialog"
            aria-modal="true"
            aria-label="Image viewer"
            onClick={() => setOpen(false)}
          >
            <div className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 rounded-full bg-black/25 px-3 py-1 text-[12px] font-medium text-white/85 backdrop-blur-sm">
              {Math.round(scale * 100)}%
            </div>
            <div className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex items-center gap-2">
              <ViewerButton label="Zoom out" onClick={() => zoomBy(-ZOOM_STEP)} disabled={scale <= MIN_SCALE}>
                <ZoomOut className="h-5 w-5" strokeWidth={2.25} aria-hidden />
              </ViewerButton>
              <ViewerButton label="Reset zoom" onClick={resetZoom} disabled={scale === 1 && offset.x === 0 && offset.y === 0}>
                <RotateCcw className="h-5 w-5" strokeWidth={2.25} aria-hidden />
              </ViewerButton>
              <ViewerButton label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)} disabled={scale >= MAX_SCALE}>
                <ZoomIn className="h-5 w-5" strokeWidth={2.25} aria-hidden />
              </ViewerButton>
              <ViewerButton label="Close" onClick={() => setOpen(false)}>
                <X className="h-5 w-5" strokeWidth={2.25} aria-hidden />
              </ViewerButton>
            </div>
            <div
              className="relative flex h-full w-full max-w-full touch-none items-center justify-center overflow-hidden"
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => {
                e.preventDefault();
                zoomTo(scale > 1 ? 1 : 2.5);
              }}
              onWheel={(e) => {
                e.preventDefault();
                zoomBy(e.deltaY < 0 ? 0.25 : -0.25);
              }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                const point = pointerPoint(e);
                activePointersRef.current.set(e.pointerId, point);
                const pointers = [...activePointersRef.current.values()];
                if (pointers.length === 2) {
                  pinchRef.current = {
                    startDistance: distance(pointers[0]!, pointers[1]!),
                    startScale: scale,
                  };
                  dragRef.current = null;
                  return;
                }
                if (scale > 1) {
                  dragRef.current = { pointerId: e.pointerId, last: point };
                }
              }}
              onPointerMove={(e) => {
                if (!activePointersRef.current.has(e.pointerId)) return;
                const point = pointerPoint(e);
                activePointersRef.current.set(e.pointerId, point);
                const pointers = [...activePointersRef.current.values()];
                if (pointers.length >= 2 && pinchRef.current) {
                  const nextDistance = distance(pointers[0]!, pointers[1]!);
                  if (pinchRef.current.startDistance > 0) {
                    zoomTo(pinchRef.current.startScale * (nextDistance / pinchRef.current.startDistance));
                  }
                  return;
                }
                if (dragRef.current?.pointerId === e.pointerId && scale > 1) {
                  const last = dragRef.current.last;
                  setOffset((current) => ({
                    x: current.x + point.x - last.x,
                    y: current.y + point.y - last.y,
                  }));
                  dragRef.current = { pointerId: e.pointerId, last: point };
                }
              }}
              onPointerUp={(e) => {
                activePointersRef.current.delete(e.pointerId);
                dragRef.current = null;
                if (activePointersRef.current.size < 2) pinchRef.current = null;
                if (scale <= 1) setOffset({ x: 0, y: 0 });
              }}
              onPointerCancel={(e) => {
                activePointersRef.current.delete(e.pointerId);
                dragRef.current = null;
                if (activePointersRef.current.size < 2) pinchRef.current = null;
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- full-size same URL as message */}
              <img
                src={imageUrl}
                alt=""
                className={cn(
                  "max-h-[92dvh] max-w-full select-none object-contain transition-transform duration-75 ease-out",
                  scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in",
                )}
                style={{
                  transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
                }}
                draggable={false}
              />
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (Date.now() - mountedAtRef.current < NEW_IMAGE_GHOST_CLICK_GUARD_MS) return;
          setOpen(true);
        }}
        className={cn(
          "relative block w-full cursor-zoom-in border-0 bg-transparent p-0 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
        aria-label="View image full size"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded / blob URL */}
        <img src={imageUrl} alt="" className={cn(className, "pointer-events-none")} />
      </button>
      {preview}
    </>
  );
}

function ViewerButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full",
        "bg-background/15 text-white backdrop-blur-sm transition hover:bg-background/25",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80",
        "disabled:opacity-35",
      )}
      aria-label={label}
    >
      {children}
    </button>
  );
}
