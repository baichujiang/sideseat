"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Search, UserPlus, UsersRound, X } from "lucide-react";

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

function contactDisplayName(c: { nickname: string | null; username: string }): string {
  return (c.nickname?.trim() || c.username).trim();
}

function hitDisplayName(hit: SearchHit): string {
  return (hit.nickname?.trim() || hit.username).trim();
}

/** Latin A–Z buckets; digits/symbols → "#"; CJK etc. → that character as section. */
function sectionKeyFromDisplayName(name: string): string {
  const t = name.trim();
  if (!t) return "#";
  const ch = t[0]!;
  if (/[a-zA-Z]/.test(ch)) return ch.toUpperCase();
  if (/[0-9]/.test(ch)) return "#";
  return ch;
}

function compareSectionKeys(a: string, b: string): number {
  const isAtoZ = (k: string) => /^[A-Z]$/.test(k);
  if (isAtoZ(a) && isAtoZ(b)) return a.localeCompare(b);
  if (isAtoZ(a)) return -1;
  if (isAtoZ(b)) return 1;
  if (a === "#") return 1;
  if (b === "#") return -1;
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

function groupRowsBySection<T>(rows: T[], nameOf: (row: T) => string): { key: string; rows: T[] }[] {
  const sorted = [...rows].sort((x, y) =>
    nameOf(x).localeCompare(nameOf(y), undefined, { sensitivity: "base", numeric: true }),
  );
  const map = new Map<string, T[]>();
  for (const row of sorted) {
    const key = sectionKeyFromDisplayName(nameOf(row));
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return [...map.entries()]
    .sort(([ka], [kb]) => compareSectionKeys(ka, kb))
    .map(([key, r]) => ({ key, rows: r }));
}

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

  const groupedContacts = useMemo(
    () => groupRowsBySection(contacts, contactDisplayName),
    [contacts],
  );

  const groupedSearchHits = useMemo(
    () => groupRowsBySection(searchHits, hitDisplayName),
    [searchHits],
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
        className={cn(
          "inline-flex h-10 w-10 items-center justify-center rounded-full border border-classmates-blue-border bg-gradient-to-br from-classmates-blue-soft to-white text-classmates-blue shadow-[0_4px_16px_-6px_rgba(37,99,235,0.45)] transition",
          "hover:border-classmates-blue/40 hover:shadow-[0_6px_20px_-6px_rgba(37,99,235,0.5)] active:scale-[0.97]",
          "dark:border-blue-500/45 dark:from-blue-950/55 dark:to-blue-950/25 dark:text-blue-200 dark:shadow-[0_4px_20px_-8px_rgba(59,130,246,0.35)]",
        )}
      >
        <Plus className="h-5 w-5" strokeWidth={2.4} aria-hidden />
      </button>

      <AppPushLayer open={open} onClose={close} zClassName="z-[60]" panelClassName="w-[min(100vw,28rem)] border-0">
        <div className="flex h-full min-h-0 flex-col bg-background pt-[env(safe-area-inset-top)]">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
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

            <div
              className={cn(
                "mb-4 flex shrink-0 gap-0.5 rounded-2xl border border-classmates-blue-border/90 bg-classmates-blue-soft/70 p-1 shadow-inner",
                "dark:border-blue-800/55 dark:bg-blue-950/30",
              )}
            >
              <Segment
                active={mode === "contact"}
                onClick={() => setMode("contact")}
                icon={<UserPlus className="h-3.5 w-3.5 shrink-0 opacity-90" strokeWidth={2.25} aria-hidden />}
              >
                Add contact
              </Segment>
              <Segment
                active={mode === "group"}
                onClick={() => setMode("group")}
                icon={<UsersRound className="h-3.5 w-3.5 shrink-0 opacity-90" strokeWidth={2.25} aria-hidden />}
              >
                New group
              </Segment>
            </div>

            {mode === "contact" ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                <div className="flex shrink-0 items-center gap-3 rounded-[20px] border border-border/70 bg-card/50 px-4 py-3">
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by user ID, username, or email"
                    className="h-auto border-0 bg-transparent p-0 text-[14px] shadow-none focus-visible:ring-0"
                  />
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain pr-1 pb-4 [scrollbar-gutter:stable]">
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
                        <div className="space-y-0">
                          {groupedSearchHits.map(({ key, rows }) => (
                            <div key={key}>
                              <ContactSectionHeader label={key} />
                              <ul className="divide-y divide-border/50 rounded-lg border border-border/60 bg-card/30">
                                {rows.map((hit) => {
                                  const existing = contactsByPeerId.get(hit.id);
                                  return (
                                    <li
                                      key={hit.id}
                                      className="flex items-center gap-2.5 px-2.5 py-2"
                                      title={`ID: ${hit.id}`}
                                    >
                                      <PresetAvatar id={hit.avatarUrl} size={34} className="shrink-0" />
                                      <div className="min-w-0 flex-1 leading-tight">
                                        <p className="truncate text-[13px] font-medium text-foreground">
                                          {hit.nickname?.trim() || hit.username}
                                        </p>
                                        <p className="truncate text-[11px] text-muted-foreground">
                                          @{hit.username}
                                          {hit.email ? ` · ${hit.email}` : ""}
                                        </p>
                                      </div>
                                      {existing || hit.activeConnectionId ? (
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-8 shrink-0 rounded-full px-3 text-[12px]"
                                          onClick={() =>
                                            router.push(
                                              `/connections/${existing?.connectionId || hit.activeConnectionId}?returnTo=%2Finbox`,
                                            )
                                          }
                                        >
                                          Open
                                        </Button>
                                      ) : (
                                        <Button
                                          type="button"
                                          size="sm"
                                          className="h-8 shrink-0 rounded-full px-3 text-[12px]"
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
                            </div>
                          ))}
                        </div>
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
                      <div className="space-y-2">
                        {groupedContacts.map(({ key, rows }) => (
                          <div key={key}>
                            <ContactSectionHeader label={key} />
                            <ul className="divide-y divide-border/50 rounded-lg border border-border/60 bg-card/30">
                              {rows.map((contact) => (
                                <li key={contact.connectionId} className="flex items-center gap-2.5 px-2.5 py-2">
                                  <PresetAvatar id={contact.avatarUrl} size={34} className="shrink-0" />
                                  <div className="min-w-0 flex-1 leading-tight">
                                    <p className="truncate text-[13px] font-medium text-foreground">
                                      {contact.nickname?.trim() || contact.username}
                                    </p>
                                    <p className="truncate text-[11px] text-muted-foreground">@{contact.username}</p>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 shrink-0 rounded-full px-3 text-[12px]"
                                    onClick={() =>
                                      router.push(`/connections/${contact.connectionId}?returnTo=%2Finbox`)
                                    }
                                  >
                                    Chat
                                  </Button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>

                {searchError ? (
                  <p className="shrink-0 text-[12px] text-destructive">{searchError}</p>
                ) : null}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                <div className="shrink-0 rounded-2xl border border-border/70 bg-card/50 px-3 py-2.5">
                  <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Optional group name</p>
                  <Input
                    value={groupTitle}
                    onChange={(e) => setGroupTitle(e.target.value)}
                    placeholder="Study plans, Project team, Friday dinner…"
                    maxLength={80}
                    className="h-11 rounded-xl border-border/70 text-[14px]"
                  />
                </div>

                <div className="flex shrink-0 items-center justify-between rounded-2xl border border-border/70 bg-card/50 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <UsersRound className="h-4 w-4 text-muted-foreground" />
                    <p className="text-[13px] font-medium text-foreground">Select contacts</p>
                  </div>
                  <p className="text-[12px] text-muted-foreground">{selectedIds.length} selected</p>
                </div>

                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-y-contain pr-1 pb-4 [scrollbar-gutter:stable]">
                  {contacts.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground">Add contacts first, then you can create a group.</p>
                  ) : (
                    groupedContacts.map(({ key, rows }) => (
                      <div key={key}>
                        <ContactSectionHeader label={key} />
                        <ul className="divide-y divide-border/50 rounded-lg border border-border/60 bg-card/30">
                          {rows.map((contact) => {
                            const selected = selectedIds.includes(contact.peerId);
                            return (
                              <li key={contact.connectionId}>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedIds((current) =>
                                      current.includes(contact.peerId)
                                        ? current.filter((id) => id !== contact.peerId)
                                        : [...current, contact.peerId],
                                    )
                                  }
                                  className={cn(
                                    "flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition",
                                    selected ? "bg-primary/6" : "hover:bg-muted/25",
                                  )}
                                >
                                  <PresetAvatar id={contact.avatarUrl} size={34} className="shrink-0" />
                                  <div className="min-w-0 flex-1 leading-tight">
                                    <p className="truncate text-[13px] font-medium text-foreground">
                                      {contact.nickname?.trim() || contact.username}
                                    </p>
                                    <p className="truncate text-[11px] text-muted-foreground">@{contact.username}</p>
                                  </div>
                                  <span
                                    className={cn(
                                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                                      selected
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-border bg-background text-transparent",
                                    )}
                                  >
                                    <Check className="h-3 w-3" strokeWidth={2.5} />
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))
                  )}
                </div>

                {groupError ? (
                  <p className="shrink-0 text-[12px] text-destructive">{groupError}</p>
                ) : null}

                <div className="flex shrink-0 gap-2">
                  <Button type="button" variant="ghost" className="h-11 flex-1 rounded-xl font-medium" onClick={close}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={groupSubmitting || selectedIds.length < 2}
                    onClick={() => void createGroup()}
                    className={cn(
                      "h-11 flex-1 rounded-xl font-semibold shadow-md transition",
                      "bg-classmates-blue text-white hover:bg-classmates-blue/92 hover:shadow-lg",
                      "disabled:opacity-45 disabled:shadow-none dark:bg-blue-600 dark:hover:bg-blue-600/90",
                    )}
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

function ContactSectionHeader({ label }: { label: string }) {
  const latin = /^[A-Z]$/.test(label);
  return (
    <div
      className={cn(
        "sticky top-0 z-[1] -mx-0.5 border-b border-border/45 bg-background/95 px-2 py-1.5 text-[10px] font-semibold text-muted-foreground backdrop-blur-sm",
        latin && "uppercase tracking-[0.14em]",
      )}
    >
      {label}
    </div>
  );
}

function Segment({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[13px] font-semibold transition sm:px-3",
        active
          ? cn(
              "bg-white text-classmates-blue shadow-[0_2px_12px_-4px_rgba(37,99,235,0.35)] ring-1 ring-classmates-blue-border/80",
              "dark:bg-card dark:text-blue-200 dark:ring-blue-500/30",
            )
          : "text-classmates-sub hover:bg-white/70 hover:text-foreground dark:text-zinc-400 dark:hover:bg-blue-950/40 dark:hover:text-zinc-200",
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}
