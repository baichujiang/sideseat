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
  const running = useRef(false);
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

  const flush = async () => {
    if (running.current || !pending.current) return;
    running.current = true; setSaving(true); setError("");
    while (pending.current) {
      const draft = pending.current; pending.current = null;
      try {
        const data = await call("/response", "PUT", draft);
        setPoll(data);
        if (!pending.current) { setSelected(data.mySlotIds); setSaved(true); }
      } catch (cause) {
        if (!pending.current) pending.current = draft;
        setError((cause as Error).message); setSaved(false);
        break;
      }
    }
    running.current = false; setSaving(false);
  };
  const saveSelection = (slots: number[]) => {
    if (!poll?.viewerId) return;
    revision.current += 1;
    const next = [...new Set(slots)].sort((a, b) => a - b);
    setSelected(next); setSaved(false);
    pending.current = { participantId: poll.viewerId, displayName: poll.myDisplayName, slotIds: next };
    void flush();
  };
  const act = async (suffix: string, method: string, body: unknown) => {
    if (running.current || pending.current) return;
    revision.current += 1; setBusy(true); setError("");
    try {
      const data = await call(suffix, method, body);
      setPoll(data); setSelected(data.mySlotIds); setEditingName(false); setSwitchingParticipant(false);
      if (suffix === "/participant" && method === "POST") setResumed(data.resumed === true);
    }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  return { poll, selected, error, busy, saving, saved, editingName, setEditingName, switchingParticipant, setSwitchingParticipant, resumed, setEditingAvailability, saveSelection, retry: flush,
    cancelNameEditing: () => { setEditingName(false); setSwitchingParticipant(false); setError(""); },
    join: (displayName: string) => act("/participant", "POST", { displayName }),
    rename: (displayName: string) => act("/participant", "PATCH", { participantId: poll?.viewerId, displayName }),
    reply: (status: string) => act("/invitation-response", "PUT", { participantId: poll?.viewerId, status, version: poll?.invitationVersion }) };
}
