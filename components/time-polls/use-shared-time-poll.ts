"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SharedTimePoll } from "@/lib/time-polls/browser-types";

type Draft = { version: 1; slotIds: number[] };
const draftKey = (token: string, viewerId: string) => `sideseat:availability-draft:v1:${encodeURIComponent(token)}:${encodeURIComponent(viewerId)}`;
function readDraft(key: string, poll: SharedTimePoll): Draft | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const value = JSON.parse(raw) as Partial<Draft>;
  if (value.version !== 1 || !Array.isArray(value.slotIds) || !value.slotIds.every(Number.isInteger)) return null;
  const valid = new Set(poll.slots.map(slot => slot.id));
  return { version: 1, slotIds: [...new Set(value.slotIds)].filter(id => valid.has(id)).sort((a, b) => a - b) };
}

export function useSharedTimePoll(token: string) {
  const [poll, setPoll] = useState<SharedTimePoll | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [edited, setEdited] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submissionFailed, setSubmissionFailed] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [switchingParticipant, setSwitchingParticipant] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [recoveryLink, setRecoveryLink] = useState<string | null>(null);
  const recoveryRequest = useRef<Promise<SharedTimePoll & { resumed?: boolean }> | null>(null);
  const [editingAvailability, setEditingAvailability] = useState(false);
  const hasChanges = !!poll?.viewerId && (restoredDraft || (!poll.didRespond && edited) || selected.join(",") !== poll.mySlotIds.join(","));
  const saved = !saving && !!poll?.didRespond && !hasChanges;
  const running = useRef(false), acting = useRef(false);
  const revision = useRef(0), refreshRequest = useRef(0);
  const identity = useRef<string | null>(null);
  const dirty = useRef(false);
  dirty.current = hasChanges;
  const pauseRefresh = useRef(false);
  pauseRefresh.current = busy || saving || editingName || switchingParticipant || editingAvailability;
  const base = `/api/public/time-polls/${encodeURIComponent(token)}`;
  const call = useCallback(async (suffix = "", method = "GET", body?: unknown) => {
    const response = await fetch(base + suffix, { method, credentials: "same-origin", cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error?.message ?? "The plan could not be loaded or saved.");
    return value.data as SharedTimePoll & { resumed?: boolean };
  }, [base]);
  const storageError = () => { setStorageFailed(true); setError("This device could not keep your draft. Keep this page open until you submit."); };
  const adopt = useCallback((data: SharedTimePoll, preserveDraft: boolean) => {
    const key = data.viewerId ? draftKey(token, data.viewerId) : null;
    const keep = key === identity.current && preserveDraft && dirty.current;
    if (key !== identity.current) setRecoveryLink(null);
    identity.current = key; setPoll(data);
    if (keep) return;
    let draft: Draft | null = null;
    try { if (key) draft = readDraft(key, data); setStorageFailed(false); }
    catch { storageError(); }
    setSelected(draft?.slotIds ?? data.mySlotIds); setEdited(!!draft);
    const isDirty = !!draft;
    dirty.current = isDirty; setRestoredDraft(isDirty);
  }, [token]);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      if (pauseRefresh.current || running.current) return;
      const current = revision.current, request = ++refreshRequest.current;
      try {
        const data = await call();
        if (alive && request === refreshRequest.current && !pauseRefresh.current && !running.current) adopt(data, dirty.current || current !== revision.current);
      } catch (cause) { if (alive && request === refreshRequest.current && !running.current && current === revision.current) setError((cause as Error).message); }
    };
    const restoreFromLink = () => {
      const recovery = new URLSearchParams(window.location.hash.slice(1)).get("recover");
      if (recovery !== null) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        revision.current += 1; refreshRequest.current += 1;
        recoveryRequest.current = call("/participant/recovery", "POST", { credential: recovery });
      }
      if (!recoveryRequest.current) return false;
      const request = recoveryRequest.current;
      setBusy(true);
      void request.then(data => {
        if (alive && recoveryRequest.current === request) { adopt(data, false); setResumed(true); }
      }).catch(async cause => {
        if (!alive) return;
        try { const data = await call(); if (alive) adopt(data, false); } catch { /* Keep the recovery failure visible. */ }
        if (alive) setError((cause as Error).message);
      }).finally(() => { if (alive && recoveryRequest.current === request) { recoveryRequest.current = null; setBusy(false); } });
      return true;
    };
    if (!restoreFromLink()) void refresh();
    const hashChanged = () => { if (new URLSearchParams(window.location.hash.slice(1)).has("recover")) restoreFromLink(); };
    window.addEventListener("hashchange", hashChanged);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 15000);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); window.removeEventListener("hashchange", hashChanged); };
  }, [call, adopt]);

  useEffect(() => {
    if (!hasChanges || !storageFailed) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasChanges, storageFailed]);

  const submit = async () => {
    if (!poll?.viewerId || poll.phase !== "COLLECTING" || !hasChanges || acting.current || running.current) return false;
    running.current = true; setSaving(true); setSubmissionFailed(false); setError("");
    refreshRequest.current += 1;
    const submittedRevision = revision.current, key = draftKey(token, poll.viewerId), slots = [...selected];
    try {
      const data = await call("/response", "PUT", { participantId: poll.viewerId, displayName: poll.myDisplayName, slotIds: slots });
      if (identity.current !== key) return false;
      setPoll(data);
      if (submittedRevision === revision.current) { setSelected(data.mySlotIds); setEdited(false); setRestoredDraft(false); }
      // An older acknowledgement must not remove edits made while it was in flight.
      try {
        const draft = readDraft(key, data);
        if (draft?.slotIds.join(",") === slots.join(",")) { localStorage.removeItem(key); setRestoredDraft(false); setEdited(false); }
        setStorageFailed(false);
      } catch { storageError(); }
      return true;
    } catch (cause) { if (identity.current === key) { setSubmissionFailed(true); setError((cause as Error).message); } return false; }
    finally { running.current = false; setSaving(false); }
  };
  const saveSelection = (slots: number[]) => {
    if (!poll?.viewerId) return;
    revision.current += 1;
    const next = [...new Set(slots)].sort((a, b) => a - b);
    dirty.current = true;
    setSelected(next); setEdited(true); setSubmissionFailed(false); setError("");
    try {
      const key = draftKey(token, poll.viewerId);
      if (!running.current && !restoredDraft && poll.didRespond && next.join(",") === poll.mySlotIds.join(",")) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify({ version: 1, slotIds: next } satisfies Draft));
      setStorageFailed(false);
    } catch { storageError(); }
  };
  const act = async (suffix: string, method: string, body: unknown) => {
    if (acting.current || running.current) return false;
    acting.current = true;
    revision.current += 1; refreshRequest.current += 1; setBusy(true); setError("");
    try {
      const data = await call(suffix, method, body);
      adopt(data, true); setEditingName(false); setSwitchingParticipant(false);
      if (suffix === "/participant" && method === "POST") setResumed(data.resumed === true);
      return true;
    }
    catch (cause) { setError((cause as Error).message); return false; }
    finally { acting.current = false; setBusy(false); }
  };
  const loadRecoveryLink = async () => {
    if (!poll?.viewerId || busy || saving) return null;
    const viewer = poll.viewerId;
    setBusy(true); setError("");
    try {
      const response = await fetch(`${base}/participant/recovery?participantId=${encodeURIComponent(viewer)}`, { cache: "no-store", credentials: "same-origin" });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error?.message ?? "Your recovery link could not be opened.");
      if (identity.current !== draftKey(token, viewer)) return null;
      setRecoveryLink(value.data.recoveryUrl as string);
      return value.data.recoveryUrl as string;
    } catch (cause) { setError((cause as Error).message); return null; }
    finally { setBusy(false); }
  };
  return { poll, selected, error, busy, saving, saved, hasChanges, submissionFailed, restoredDraft, editingName, setEditingName, switchingParticipant, setSwitchingParticipant, resumed, recoveryLink, loadRecoveryLink, setEditingAvailability, saveSelection, submit, retry: submit,
    cancelNameEditing: () => { setEditingName(false); setSwitchingParticipant(false); setError(""); },
    join: (displayName: string) => act("/participant", "POST", { displayName, newParticipant: switchingParticipant }),
    rename: (displayName: string) => act("/participant", "PATCH", { participantId: poll?.viewerId, displayName }),
    suggestActivity: (title: string, location: string) => act("/activities", "POST", { participantId: poll?.viewerId, title, location }),
    setActivityInterest: (ideaId: string, interested: boolean) => act("/activities/interest", "PUT", { participantId: poll?.viewerId, ideaId, interested }),
    reply: (status: string) => act("/invitation-response", "PUT", { participantId: poll?.viewerId, status, version: poll?.invitationVersion }) };
}
