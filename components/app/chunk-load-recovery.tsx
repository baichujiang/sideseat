"use client";

import { useEffect } from "react";

const CHUNK_LOAD_RECOVERY_PREFIX = "sideseat:chunk-load-recovery:";

function isChunkLoadFailure(reason: unknown): boolean {
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : reason && typeof reason === "object" && "message" in reason
          ? String((reason as { message?: unknown }).message ?? "")
          : "";

  return /ChunkLoadError|Loading chunk .* failed|Loading CSS chunk .* failed/i.test(message);
}

export function ChunkLoadRecovery() {
  useEffect(() => {
    const recoveryKey = `${CHUNK_LOAD_RECOVERY_PREFIX}${window.location.pathname}`;
    const clearRecoveryFlag = window.setTimeout(() => {
      window.sessionStorage.removeItem(recoveryKey);
    }, 10_000);

    const recoverOnce = (reason: unknown) => {
      if (!isChunkLoadFailure(reason)) return;
      if (window.sessionStorage.getItem(recoveryKey) === "1") return;
      window.sessionStorage.setItem(recoveryKey, "1");
      window.location.reload();
    };

    const onError = (event: ErrorEvent) => {
      recoverOnce(event.error ?? event.message);
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      recoverOnce(event.reason);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.clearTimeout(clearRecoveryFlag);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
