"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Search, UsersRound, X } from "lucide-react";

import { AppPushLayer } from "@/components/ui/app-push-layer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { cn } from "@/lib/utils";

type ContactRow = {
  peerId: string;
  connectionId: string;
  nickname: string | null;
  username: string;
  avatarUrl: string | null;
};

type SearchHit = {
  id: string;
  username: string;
  nickname: string | null;
  email: string | null;
  avatarUrl: string | null;
  activeConnectionId: string | null;
};

type Mode = "contact" | "group";

export function InboxCreateSheet({
  initialContacts,
}: {
  initialContacts: ContactRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("contact");
  const [contacts, setContacts] = useState(initialContacts);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchError, setSearchError] = useState("");
  const [busyPeerId, setBusyPeerId] = useState<string | null>(null);
  const [groupTitle, setGroupTitle] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupSubmitting, setGroupSubmitting] = useState(false);
  const [groupError, setGroupError] = useState("");

  useEffect(() => {
    setContacts(initialContacts);
  }, [initialContacts]);

  useEffect(() => {
    if (!open || mode !== "contact") return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchHits([]);
      setSearchError("");
      return;
    }

    let cancelled = false;
    const id = window.setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      const response = await apiFetch(`/api/contacts/search?q=${encodeURIComponent(trimmed)}`, {
        cache: "no-store",
      }).catch(() => null);

      if (!response?.ok) {
        if (!cancelled) {
          setSearchError("Unable to search right now.");
          setSearching(false);
        }
        return;
      }

      const payload = await response.json().catch(() => null);
      if (!cancelled) {
        setSearchHits(Array.isArray(payload?.data?.hits) ? payload.data.hits : []);
        setSearching(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [mode, open, query]);

  const contactsByPeerId = useMemo(
    () => new Map(contacts.map((contact) => [contact.peerId, contact])),
    [contacts],
  );

  async function addContact(hit: SearchHit) {
    if (busyPeerId) return;
    setBusyPeerId(hit.id);
    setSearchError("");

    const response = await apiFetch("/api/contacts/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ peerId: hit.id }),
    }).catch(() => null);

    const payload = await response?.json().catch(() => null);
    if (!response?.ok || !payload?.success) {
      setSearchError(payload?.error || "Unable to add contact.");
      setBusyPeerId(null);
      return;
    }

    const connectionId = payload.data?.connectionId;
    if (typeof connectionId === "string" && !contactsByPeerId.has(hit.id)) {
      setContacts((current) => [
        {
          peerId: hit.id,
          connectionId,
          nickname: hit.nickname,
          username: hit.username,
          avatarUrl: hit.avatarUrl,
        },
        ...current,
      ]);
    }
    setSearchHits((current) =>
      current.map((row) => (row.id === hit.id ? { ...row, activeConnectionId: connectionId } : row)),
    );
    setBusyPeerId(null);
    router.refresh();
  }

  async function createGroup() {
    if (groupSubmitting || selectedIds.length < 2) return;
    setGroupSubmitting(true);
    setGroupError("");

    const response = await apiFetch("/api/group-chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: groupTitle,
        participantIds: selectedIds,
      }),
    }).catch(() => null);

    const payload = await response?.json().catch(() => null);
    if (!response?.ok || !payload?.success || typeof payload?.data?.groupChatId !== "string") {
      setGroupError(payload?.error || "Unable to create group chat.");
      setGroupSubmitting(false);
      return;
    }

    const groupChatId = payload.data.groupChatId;
    setOpen(false);
    setGroupSubmitting(false);
    setSelectedIds([]);
    setGroupTitle("");
    router.refresh();
    router.push(`/groups/${groupChatId}?returnTo=%2Finbox`);
  }

  function close() {
    setOpen(false);
    setMode("contact");
    setQuery("");
    setSearchHits([]);
    setSearchError("");
    setGroupError("");
    setSelectedIds([]);
    setGroupTitle("");
    setBusyPeerId(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Add contact or create group chat"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-classmates-edge bg-classmates-surface text-foreground shadow-sm transition hover:bg-classmates-warm-alt active:scale-[0.98] dark:border-border dark:bg-card"
      >
        <Plus className="h-5 w-5" strokeWidth={2.3} />
      </button>

      <AppPushLayer open={open} onClose={close} zClassName="z-40" panelClassName="w-[min(100vw,28rem)] border-0">
        <div className="flex h-full min-h-0 flex-col bg-background pt-[env(safe-area-inset-top)]">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold text-foreground">New chat</h3>
                <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                  Search by user ID, username, or verified email. Then add contacts or start a group.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                aria-label="Close"
              >
                <X className="h-4 w-4" strokeWidth={2.25} />
              </button>
            </div>

            <div className="mb-4 flex rounded-full border border-border/70 bg-muted/30 p-1">
              <Segment active={mode === "contact"} onClick={() => setMode("contact")}>
                Add contact
              </Segment>
              <Segment active={mode === "group"} onClick={() => setMode("group")}>
                New group
              </Segment>
            </div>

            {mode === "contact" ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-[20px] border border-border/70 bg-card/50 px-4 py-3">
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by user ID, username, or email"
                    className="h-auto border-0 bg-transparent p-0 text-[14px] shadow-none focus-visible:ring-0"
                  />
                </div>

                <div className="max-h-[42dvh] space-y-3 overflow-y-auto pr-1">
                  {query.trim().length >= 2 ? (
                    <section className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Search results
                      </p>
                      {searching ? (
                        <p className="text-[13px] text-muted-foreground">Searching…</p>
                      ) : searchHits.length === 0 ? (
                        <p className="text-[13px] text-muted-foreground">No matching users yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {searchHits.map((hit) => {
                            const existing = contactsByPeerId.get(hit.id);
                            return (
                              <li key={hit.id} className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/50 px-3 py-3">
                                <PresetAvatar id={hit.avatarUrl} size={44} />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[14px] font-semibold text-foreground">
                                    {hit.nickname?.trim() || hit.username}
                                  </p>
                                  <p className="truncate text-[12px] text-muted-foreground">
                                    @{hit.username}
                                    {hit.email ? ` · ${hit.email}` : ""}
                                  </p>
                                  <p className="truncate text-[11px] text-muted-foreground/90">ID: {hit.id}</p>
                                </div>
                                {existing || hit.activeConnectionId ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="rounded-full"
                                    onClick={() =>
                                      router.push(`/connections/${existing?.connectionId || hit.activeConnectionId}?returnTo=%2Finbox`)
                                    }
                                  >
                                    Open
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="rounded-full"
                                    disabled={busyPeerId === hit.id}
                                    onClick={() => void addContact(hit)}
                                  >
                                    {busyPeerId === hit.id ? "Adding…" : "Add"}
                                  </Button>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>
                  ) : null}

                  <section className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Contacts
                    </p>
                    {contacts.length === 0 ? (
                      <p className="text-[13px] text-muted-foreground">No contacts yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {contacts.map((contact) => (
                          <li key={contact.connectionId} className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/50 px-3 py-3">
                            <PresetAvatar id={contact.avatarUrl} size={44} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[14px] font-semibold text-foreground">
                                {contact.nickname?.trim() || contact.username}
                              </p>
                              <p className="truncate text-[12px] text-muted-foreground">@{contact.username}</p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-full"
                              onClick={() => router.push(`/connections/${contact.connectionId}?returnTo=%2Finbox`)}
                            >
                              Chat
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>

                {searchError ? <p className="text-[12px] text-destructive">{searchError}</p> : null}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-2xl border border-border/70 bg-card/50 px-3 py-2.5">
                  <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Optional group name</p>
                  <Input
                    value={groupTitle}
                    onChange={(e) => setGroupTitle(e.target.value)}
                    placeholder="Study plans, Project team, Friday dinner…"
                    maxLength={80}
                    className="h-11 rounded-xl border-border/70 text-[14px]"
                  />
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-card/50 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <UsersRound className="h-4 w-4 text-muted-foreground" />
                    <p className="text-[13px] font-medium text-foreground">Select contacts</p>
                  </div>
                  <p className="text-[12px] text-muted-foreground">{selectedIds.length} selected</p>
                </div>

                <div className="max-h-[42dvh] space-y-2 overflow-y-auto pr-1">
                  {contacts.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground">Add contacts first, then you can create a group.</p>
                  ) : (
                    contacts.map((contact) => {
                      const selected = selectedIds.includes(contact.peerId);
                      return (
                        <button
                          key={contact.connectionId}
                          type="button"
                          onClick={() =>
                            setSelectedIds((current) =>
                              current.includes(contact.peerId)
                                ? current.filter((id) => id !== contact.peerId)
                                : [...current, contact.peerId],
                            )
                          }
                          className={cn(
                            "flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition",
                            selected
                              ? "border-primary/60 bg-primary/5"
                              : "border-border/70 bg-card/50 hover:bg-muted/30",
                          )}
                        >
                          <PresetAvatar id={contact.avatarUrl} size={44} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-semibold text-foreground">
                              {contact.nickname?.trim() || contact.username}
                            </p>
                            <p className="truncate text-[12px] text-muted-foreground">@{contact.username}</p>
                          </div>
                          <span
                            className={cn(
                              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                              selected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background text-transparent",
                            )}
                          >
                            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                {groupError ? <p className="text-[12px] text-destructive">{groupError}</p> : null}

                <div className="flex gap-2">
                  <Button type="button" variant="ghost" className="h-11 flex-1 rounded-xl" onClick={close}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className="h-11 flex-1 rounded-xl"
                    disabled={groupSubmitting || selectedIds.length < 2}
                    onClick={() => void createGroup()}
                  >
                    {groupSubmitting ? "Creating…" : "Create group"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </AppPushLayer>
    </>
  );
}

function Segment({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-full px-3 py-2 text-[13px] font-semibold transition",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
