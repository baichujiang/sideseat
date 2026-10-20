"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SharedTimePoll } from "@/lib/time-polls/browser-types";

export function useSharedTimePoll(token: string) {
  const [poll, setPoll] = useState<SharedTimePoll | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [edited, setEdited] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [switchingParticipant, setSwitchingParticipant] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [editingAvailability, setEditingAvailability] = useState(false);
  const hasChanges = !!poll?.viewerId && ((!poll.didRespond && edited) || selected.join(",") !== poll.mySlotIds.join(","));
  const saved = !!poll?.didRespond && !hasChanges;
  const running = useRef(false);
  const revision = useRef(0);
  const pauseRefresh = useRef(false);
  pauseRefresh.current = busy || saving || hasChanges || editingName || switchingParticipant || editingAvailability;
  const base = `/api/public/time-polls/${encodeURIComponent(token)}`;
  const call = useCallback(async (suffix = "", method = "GET", body?: unknown) => {
    const response = await fetch(base + suffix, { method, credentials: "same-origin", cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error?.message ?? "The plan could not be loaded or saved.");
    return value.data as SharedTimePoll & { resumed?: boolean };
  }, [base]);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      if (pauseRefresh.current || running.current) return;
      const current = revision.current;
      try {
        const data = await call();
        if (alive && current === revision.current && !pauseRefresh.current && !running.current) {
          setPoll(data); setSelected(data.mySlotIds); setEdited(false); setError("");
        }
      } catch (cause) { if (alive && current === revision.current) setError((cause as Error).message); }
    };
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 15000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [call]);

  useEffect(() => {
    if (!hasChanges) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasChanges]);

  const submit = async () => {
    if (!poll?.viewerId || poll.phase !== "COLLECTING" || !hasChanges || busy || running.current) return false;
    running.current = true; setSaving(true); setError("");
    const submittedRevision = revision.current;
    try {
      const data = await call("/response", "PUT", { participantId: poll.viewerId, displayName: poll.myDisplayName, slotIds: selected });
      setPoll(data);
      if (submittedRevision === revision.current) { setSelected(data.mySlotIds); setEdited(false); }
      return true;
    } catch (cause) { setError((cause as Error).message); return false; }
    finally { running.current = false; setSaving(false); }
  };
  const saveSelection = (slots: number[]) => {
    if (!poll?.viewerId) return;
    revision.current += 1;
    setSelected([...new Set(slots)].sort((a, b) => a - b)); setEdited(true); setError("");
  };
  const act = async (suffix: string, method: string, body: unknown) => {
    if (busy || running.current || hasChanges) return false;
    revision.current += 1; setBusy(true); setError("");
    try {
      const data = await call(suffix, method, body);
      setPoll(data); setSelected(data.mySlotIds); setEdited(false); setEditingName(false); setSwitchingParticipant(false);
      if (suffix === "/participant" && method === "POST") setResumed(data.resumed === true);
      return true;
    }
    catch (cause) { setError((cause as Error).message); return false; }
    finally { setBusy(false); }
  };
  return { poll, selected, error, busy, saving, saved, hasChanges, editingName, setEditingName, switchingParticipant, setSwitchingParticipant, resumed, setEditingAvailability, saveSelection, submit, retry: submit,
    cancelNameEditing: () => { setEditingName(false); setSwitchingParticipant(false); setError(""); },
    join: (displayName: string) => act("/participant", "POST", { displayName }),
    rename: (displayName: string) => act("/participant", "PATCH", { participantId: poll?.viewerId, displayName }),
    suggestActivity: (title: string, location: string) => act("/activities", "POST", { participantId: poll?.viewerId, title, location }),
    setActivityInterest: (ideaId: string, interested: boolean) => act("/activities/interest", "PUT", { participantId: poll?.viewerId, ideaId, interested }),
    reply: (status: string) => act("/invitation-response", "PUT", { participantId: poll?.viewerId, status, version: poll?.invitationVersion }) };
}
