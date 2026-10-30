"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SharedTimePoll } from "@/lib/time-polls/browser-types";

type Draft = { version: 1; slotIds: number[] };
const pendingViewer = "__pending_guest__";
const switchingKey = (token: string) => `sideseat:switching-participant:v1:${encodeURIComponent(token)}`;
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
  const switchingRef = useRef(false);
  const changeSwitching = useCallback((value: boolean) => { switchingRef.current = value; setSwitchingParticipant(value); try { if (value) localStorage.setItem(switchingKey(token), "1"); else localStorage.removeItem(switchingKey(token)); } catch { setStorageFailed(true); setError("This device could not keep your draft. Keep this page open until you submit."); } }, [token]);
  const [resumed, setResumed] = useState(false);
  const [recoveryLink, setRecoveryLink] = useState<string | null>(null);
  const recoveryRequest = useRef<Promise<SharedTimePoll & { resumed?: boolean }> | null>(null);
  const [editingAvailability, setEditingAvailability] = useState(false);
  const hasChanges = !!poll && (switchingParticipant || !poll.viewerId ? edited || restoredDraft : restoredDraft || (!poll.didRespond && edited) || selected.join(",") !== poll.mySlotIds.join(","));
  const saved = !switchingParticipant && !saving && !!poll?.didRespond && !hasChanges;
  const running = useRef(false), acting = useRef(false);
  const revision = useRef(0), refreshRequest = useRef(0);
  const identity = useRef<string | null>(null);
  const dirty = useRef(false);
  dirty.current = hasChanges;
  const pauseRefresh = useRef(false);
  pauseRefresh.current = busy || saving || editingName || (switchingParticipant && !!poll) || editingAvailability;
  const base = `/api/public/time-polls/${encodeURIComponent(token)}`;
  const call = useCallback(async (suffix = "", method = "GET", body?: unknown) => {
    const response = await fetch(base + suffix, { method, credentials: "same-origin", cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error?.message ?? "The plan could not be loaded or saved.");
    return value.data as SharedTimePoll & { resumed?: boolean };
  }, [base]);
  const storageError = () => { setStorageFailed(true); setError("This device could not keep your draft. Keep this page open until you submit."); };
  const adopt = useCallback((data: SharedTimePoll, preserveDraft: boolean) => {
    const key = draftKey(token, switchingRef.current ? pendingViewer : data.viewerId ?? pendingViewer);
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
    try { if (localStorage.getItem(switchingKey(token)) === "1") { switchingRef.current = true; setSwitchingParticipant(true); } } catch { storageError(); }
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
        changeSwitching(false);
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
  }, [call, adopt, changeSwitching, token]);

  useEffect(() => {
    if (!hasChanges || !storageFailed) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasChanges, storageFailed]);

  const submit = async (displayName = "") => {
    if (!poll || poll.phase !== "COLLECTING" || !hasChanges || acting.current || running.current) return false;
    running.current = true; setSaving(true); setSubmissionFailed(false); setError("");
    refreshRequest.current += 1;
    const submittedRevision = revision.current, slots = [...selected];
    let key = draftKey(token, poll.viewerId ?? pendingViewer);
    try {
      let current = poll;
      if (!current.viewerId || switchingParticipant) {
        if (!displayName.trim()) return false;
        const pendingKey = draftKey(token, pendingViewer);
        const guest = await call("/participant", "POST", { displayName: displayName.trim(), newParticipant: switchingParticipant });
        current = guest;
        if (!current.viewerId) throw new Error("The participant could not be created.");
        key = draftKey(token, current.viewerId);
        identity.current = key; setPoll(current); changeSwitching(false); setResumed(guest.resumed === true);
        try { localStorage.setItem(key, JSON.stringify({ version: 1, slotIds: slots } satisfies Draft)); localStorage.removeItem(pendingKey); } catch { storageError(); }
      }
      const data = await call("/response", "PUT", { participantId: current.viewerId, displayName: current.myDisplayName, slotIds: slots });
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
    if (!poll) return;
    revision.current += 1;
    const next = [...new Set(slots)].sort((a, b) => a - b);
    dirty.current = true;
    setSelected(next); setEdited(true); setSubmissionFailed(false); setError("");
    try {
      const key = draftKey(token, switchingParticipant ? pendingViewer : poll.viewerId ?? pendingViewer);
      if (!running.current && !switchingParticipant && !restoredDraft && poll.didRespond && next.join(",") === poll.mySlotIds.join(",")) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify({ version: 1, slotIds: next } satisfies Draft));
      setStorageFailed(false);
    } catch { storageError(); }
  };
  const act = async (suffix: string, method: string, body: Record<string, unknown>, displayName = "") => {
    if (acting.current || running.current) return false;
    acting.current = true;
    revision.current += 1; refreshRequest.current += 1; setBusy(true); setError("");
    try {
      let requestBody = body;
      if (suffix !== "/participant" && (!poll?.viewerId || switchingParticipant)) {
        if (!displayName.trim()) return false;
        const guest = await call("/participant", "POST", { displayName: displayName.trim(), newParticipant: switchingParticipant });
        if (!guest.viewerId) throw new Error("The participant could not be created.");
        const pendingKey = draftKey(token, pendingViewer), guestKey = draftKey(token, guest.viewerId);
        try { const draft = localStorage.getItem(pendingKey); if (draft) { localStorage.setItem(guestKey, draft); localStorage.removeItem(pendingKey); } } catch { storageError(); }
        changeSwitching(false); adopt(guest, false); setResumed(guest.resumed === true);
        requestBody = { ...body, participantId: guest.viewerId };
      }
      const data = await call(suffix, method, requestBody);
      adopt(data, true); setEditingName(false); changeSwitching(false);
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
    cancelNameEditing: () => { setEditingName(false); changeSwitching(false); if (switchingParticipant) { try { localStorage.removeItem(draftKey(token, pendingViewer)); } catch { storageError(); } } if (switchingParticipant && poll) adopt(poll, false); setError(""); },
    startSwitchingParticipant: () => { changeSwitching(true); setResumed(false); identity.current = draftKey(token, pendingViewer); let draft: Draft | null = null; try { if (poll) draft = readDraft(identity.current, poll); } catch { storageError(); } setSelected(draft?.slotIds ?? []); setEdited(!!draft); setRestoredDraft(!!draft); dirty.current = !!draft; },
    join: (displayName: string) => act("/participant", "POST", { displayName, newParticipant: switchingParticipant }),
    rename: (displayName: string) => act("/participant", "PATCH", { participantId: poll?.viewerId, displayName }),
    suggestActivity: (title: string, location: string, displayName = "") => act("/activities", "POST", { participantId: poll?.viewerId, title, location }, displayName),
    setActivityInterest: (ideaId: string, interested: boolean, displayName = "") => act("/activities/interest", "PUT", { participantId: poll?.viewerId, ideaId, interested }, displayName),
    reply: (status: string, displayName = "") => act("/invitation-response", "PUT", { participantId: poll?.viewerId, status, version: poll?.invitationVersion }, displayName) };
}
