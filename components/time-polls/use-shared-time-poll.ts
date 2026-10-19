"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SharedTimePoll } from "@/lib/time-polls/browser-types";

type Draft = { participantId: string; displayName: string; slotIds: number[] };
export function useSharedTimePoll(token: string) {
  const [poll, setPoll] = useState<SharedTimePoll | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [switchingParticipant, setSwitchingParticipant] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [editingAvailability, setEditingAvailability] = useState(false);
  const pending = useRef<Draft | null>(null);
  const running = useRef<Promise<boolean> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingReady = useRef(false);
  const revision = useRef(0);
  const pauseRefresh = useRef(false);
  pauseRefresh.current = busy || saving || editingName || switchingParticipant || editingAvailability;
  const base = `/api/public/time-polls/${encodeURIComponent(token)}`;
  const call = useCallback(async (suffix = "", method = "GET", body?: unknown) => {
    const response = await fetch(base + suffix, { method, credentials: "same-origin", cache: "no-store", keepalive: method !== "GET", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error?.message ?? "The plan could not be loaded or saved.");
    return value.data as SharedTimePoll & { resumed?: boolean };
  }, [base]);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      if (pauseRefresh.current || pending.current || running.current) return;
      const current = revision.current;
      try {
        const data = await call();
        if (alive && current === revision.current && !pauseRefresh.current && !pending.current && !running.current) {
          setPoll(data); setSelected(data.mySlotIds); setError("");
        }
      } catch (cause) { if (alive && current === revision.current) setError((cause as Error).message); }
    };
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 15000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [call]);

  useEffect(() => {
    if (saved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saved]);

  const flush = useCallback((): Promise<boolean> => {
    clearTimeout(saveTimer.current); saveTimer.current = undefined;
    pendingReady.current = true;
    if (running.current) return running.current;
    if (!pending.current) return Promise.resolve(true);
    setSaving(true); setError("");
    running.current = (async () => {
      let succeeded = true;
      while (pendingReady.current && pending.current) {
        const draft = pending.current; pending.current = null; pendingReady.current = false;
        try {
          const data = await call("/response", "PUT", draft);
          setPoll(data);
          if (!pending.current) { setSelected(data.mySlotIds); setSaved(true); }
        } catch (cause) {
          if (!pending.current) pending.current = draft;
          clearTimeout(saveTimer.current); saveTimer.current = undefined;
          pendingReady.current = false;
          setError((cause as Error).message); setSaved(false);
          succeeded = false;
          break;
        }
      }
      running.current = null;
      setSaving(succeeded && pending.current !== null);
      return succeeded;
    })();
    return running.current;
  }, [call]);

  useEffect(() => {
    const leave = () => { void flush(); };
    const visibility = () => { if (document.visibilityState === "hidden") leave(); };
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", visibility);
      leave();
    };
  }, [flush]);
  const saveSelection = (slots: number[]) => {
    if (!poll?.viewerId) return;
    revision.current += 1;
    const next = [...new Set(slots)].sort((a, b) => a - b);
    setSelected(next); setSaved(false); setSaving(true); setError("");
    pending.current = { participantId: poll.viewerId, displayName: poll.myDisplayName, slotIds: next };
    pendingReady.current = false;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void flush(); }, 700);
  };
  const act = async (suffix: string, method: string, body: unknown) => {
    revision.current += 1; setBusy(true); setError("");
    try {
      if (!await flush() || pending.current) return false;
      const data = await call(suffix, method, body);
      setPoll(data); setSelected(data.mySlotIds); setEditingName(false); setSwitchingParticipant(false);
      if (suffix === "/participant" && method === "POST") setResumed(data.resumed === true);
      return true;
    }
    catch (cause) { setError((cause as Error).message); return false; }
    finally { setBusy(false); }
  };
  return { poll, selected, error, busy, saving, saved, editingName, setEditingName, switchingParticipant, setSwitchingParticipant, resumed, setEditingAvailability, saveSelection, retry: flush,
    cancelNameEditing: () => { setEditingName(false); setSwitchingParticipant(false); setError(""); },
    join: (displayName: string) => act("/participant", "POST", { displayName }),
    rename: (displayName: string) => act("/participant", "PATCH", { participantId: poll?.viewerId, displayName }),
    suggestActivity: (title: string, location: string) => act("/activities", "POST", { participantId: poll?.viewerId, title, location }),
    setActivityInterest: (ideaId: string, interested: boolean) => act("/activities/interest", "PUT", { participantId: poll?.viewerId, ideaId, interested }),
    reply: (status: string) => act("/invitation-response", "PUT", { participantId: poll?.viewerId, status, version: poll?.invitationVersion }) };
}
