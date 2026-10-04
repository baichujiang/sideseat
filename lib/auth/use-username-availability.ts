"use client";

import { useEffect, useRef, useState } from "react";
import { loginUsernameField, type LoginUsernameMessages } from "@/lib/validators/auth";

type Result = { username: string; status: "available" | "taken" | "failed" };

export function useUsernameAvailability(raw: string, enabled: boolean, messages: LoginUsernameMessages) {
  const username = raw.trim().toLowerCase();
  const validation = loginUsernameField(messages).safeParse(raw);
  const valid = validation.success;
  const [result, setResult] = useState<Result | null>(null);
  const [blurRevision, setBlurRevision] = useState(0);
  const blurUsername = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !valid) return;
    const controller = new AbortController();
    // Every edit invalidates the earlier result, including returning to a prior name.
    setResult(null);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/auth/username-availability", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }), cache: "no-store", signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok || payload.data?.username !== username || typeof payload.data?.available !== "boolean") throw new Error("Check unavailable");
        if (!controller.signal.aborted) setResult({ username, status: payload.data.available ? "available" : "taken" });
      } catch {
        if (!controller.signal.aborted) setResult({ username, status: "failed" });
      }
    }, blurUsername.current === username ? 0 : 400);
    blurUsername.current = null;
    return () => { clearTimeout(timer); controller.abort(); };
  }, [username, enabled, valid, blurRevision]);

  const status = !enabled || !username ? "idle" : !valid ? "invalid"
    : result?.username === username ? result.status : "checking";
  return {
    status,
    issue: validation.success ? null : validation.error.issues[0]?.message,
    blocked: status === "idle" || status === "invalid" || status === "taken" || status === "checking",
    onBlur: () => {
      if (status === "checking" || status === "failed") {
        blurUsername.current = username;
        setBlurRevision(value => value + 1);
      }
    },
  };
}
