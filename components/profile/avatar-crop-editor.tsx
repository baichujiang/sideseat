"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";

const PREVIEW_SIZE = 248;
const OUTPUT_SIZE = 512;

type Point = { x: number; y: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

async function loadImageElement(src: string, readError: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(readError));
    img.src = src;
  });
}

async function canvasToFile(canvas: HTMLCanvasElement, name: string, prepareError: string): Promise<File> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.92));
  if (blob) return new File([blob], name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });

  const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!pngBlob) {
    throw new Error(prepareError);
  }
  return new File([pngBlob], name.replace(/\.[^.]+$/, "") + ".png", { type: "image/png" });
}

export function AvatarCropEditor({
  file,
  pending = false,
  className,
  onCancel,
  onConfirm,
  /** When false, omit the centered title + hint (parent provides a nav header). */
  showIntroText = true,
}: {
  file: File;
  pending?: boolean;
  className?: string;
  onCancel: () => void;
  onConfirm: (file: File) => Promise<void> | void;
  showIntroText?: boolean;
}) {
  const { meAvatarCrop: c, common } = useAppMessages();
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const pointerStateRef = useRef<{ start: Point; origin: Point } | null>(null);

  useEffect(() => {
    const nextSrc = URL.createObjectURL(file);
    setSrc(nextSrc);
    setError("");
    setZoom(1);
    setOffset({ x: 0, y: 0 });

    loadImageElement(nextSrc, c.errorReadImage)
      .then((img) => {
        setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
      })
      .catch((cause) => {
        setImageSize(null);
        setError(cause instanceof Error ? cause.message : c.errorReadImage);
      });

    return () => URL.revokeObjectURL(nextSrc);
  }, [file, c.errorReadImage]);

  const geometry = useMemo(() => {
    if (!imageSize) return null;
    const fit = Math.max(PREVIEW_SIZE / imageSize.width, PREVIEW_SIZE / imageSize.height);
    const scaledWidth = imageSize.width * fit * zoom;
    const scaledHeight = imageSize.height * fit * zoom;
    const maxX = Math.max(0, (scaledWidth - PREVIEW_SIZE) / 2);
    const maxY = Math.max(0, (scaledHeight - PREVIEW_SIZE) / 2);
    return { fit, scaledWidth, scaledHeight, maxX, maxY };
  }, [imageSize, zoom]);

  useEffect(() => {
    if (!geometry) return;
    setOffset((current) => ({
      x: clamp(current.x, -geometry.maxX, geometry.maxX),
      y: clamp(current.y, -geometry.maxY, geometry.maxY),
    }));
  }, [geometry]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!geometry || pending) return;
    pointerStateRef.current = {
      start: { x: event.clientX, y: event.clientY },
      origin: offset,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!geometry || !pointerStateRef.current) return;
    const dx = event.clientX - pointerStateRef.current.start.x;
    const dy = event.clientY - pointerStateRef.current.start.y;
    setOffset({
      x: clamp(pointerStateRef.current.origin.x + dx, -geometry.maxX, geometry.maxX),
      y: clamp(pointerStateRef.current.origin.y + dy, -geometry.maxY, geometry.maxY),
    });
  };

  const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleConfirm = async () => {
    if (!src || !imageSize || !geometry) {
      setError(c.errorPrepareImage);
      return;
    }

    try {
      setError("");
      const image = await loadImageElement(src, c.errorReadImage);
      const scale = geometry.fit * zoom;
      const sourceSize = PREVIEW_SIZE / scale;
      const sourceX = clamp((imageSize.width - sourceSize) / 2 - offset.x / scale, 0, imageSize.width - sourceSize);
      const sourceY = clamp((imageSize.height - sourceSize) / 2 - offset.y / scale, 0, imageSize.height - sourceSize);
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const context = canvas.getContext("2d");
      if (!context) throw new Error(c.errorPrepareImage);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      const nextFile = await canvasToFile(canvas, file.name, c.errorPrepareImage);
      await onConfirm(nextFile);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : c.errorPrepareImage);
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {showIntroText ? (
        <div className="space-y-1 text-center">
          <p className="text-[15px] font-semibold text-foreground">{c.adjustTitle}</p>
          <p className="text-[12px] text-muted-foreground">{c.adjustHint}</p>
        </div>
      ) : null}

      <div className="flex justify-center">
        <div className="relative h-[248px] w-[248px] overflow-hidden rounded-full bg-muted/55 ring-1 ring-border/70">
          <div
            className="absolute inset-0 touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
          >
            {src && geometry ? (
              /* eslint-disable-next-line @next/next/no-img-element -- exact pixel geometry is required for cropping */
              <img
                alt=""
                aria-hidden="true"
                className="absolute max-w-none select-none object-cover"
                draggable={false}
                src={src}
                style={{
                  width: `${geometry.scaledWidth}px`,
                  height: `${geometry.scaledHeight}px`,
                  left: `calc(50% - ${geometry.scaledWidth / 2}px + ${offset.x}px)`,
                  top: `calc(50% - ${geometry.scaledHeight / 2}px + ${offset.y}px)`,
                }}
              />
            ) : null}
          </div>
        </div>
      </div>

      <label className="block space-y-2 px-1">
        <div className="flex items-center justify-between text-[12px] font-medium text-muted-foreground">
          <span>{c.zoomLabel}</span>
          <span>{zoom.toFixed(2)}x</span>
        </div>
        <input
          type="range"
          min="1"
          max="3"
          step="0.01"
          value={zoom}
          disabled={pending || !geometry}
          onChange={(event) => setZoom(Number(event.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-[#ff2442]"
        />
      </label>

      {error ? <p className="text-center text-[12px] text-destructive">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="button" variant="ghost" className="h-10 flex-1 rounded-full" disabled={pending} onClick={onCancel}>
          {common.cancel}
        </Button>
        <Button
          type="button"
          className="h-10 flex-1 rounded-full bg-[#ff2442] text-white hover:bg-[#e61e3a]"
          disabled={pending || !geometry}
          onClick={handleConfirm}
        >
          {pending ? c.uploading : c.usePhoto}
        </Button>
      </div>
    </div>
  );
}
