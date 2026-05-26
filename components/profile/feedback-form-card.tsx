"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import {
  BadgeCheck,
  ChevronRight,
  MessageCircle,
  MessageSquareText,
  Plus,
  Send,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  MePageSettingsRowLabel,
  mePageChevronClass,
  mePageIconMutedClass,
  mePageIconShellClass,
  mePageRowButtonClass,
  mePageRowLeadClass,
  meSettingsRowFeedbackIconShellLargeClass,
  meSettingsRowFeedbackIconSurfaceClass,
} from "@/components/profile/me-settings-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { Textarea } from "@/components/ui/textarea";
import { AppPushLayer } from "@/components/ui/app-push-layer";
import { useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";

type FeedbackVoteValue = "UP" | "DOWN";
type FeedbackTopic = "BUG" | "IDEA" | "OTHER";

type FeedbackAuthor = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

type FeedbackComment = {
  id: string;
  body: string;
  isOfficial: boolean;
  createdAt: string;
  author: FeedbackAuthor;
};

type FeedbackPost = {
  id: string;
  topic: FeedbackTopic;
  title: string;
  message: string;
  createdAt: string;
  activeAt: string;
  author: FeedbackAuthor;
  score: number;
  up: number;
  down: number;
  commentCount: number;
  myVote: FeedbackVoteValue | null;
  comments: FeedbackComment[];
};

type FeedbackPayload = {
  posts?: FeedbackPost[];
  viewer?: { isAdmin?: boolean };
  error?: string;
};

function formatFeedbackDate(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

export function FeedbackFormCard({
  compact = false,
  variant = "card",
}: {
  compact?: boolean;
  /** `header` — icon control on the Me page toolbar (opens the same dialog). `listRow` — full-width row in a divided list. */
  variant?: "card" | "header" | "listRow";
}) {
  const { meFeedback: f, common: c } = useAppMessages();
  const [open, setOpen] = useState(false);
  const [posts, setPosts] = useState<FeedbackPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewerIsAdmin, setViewerIsAdmin] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [voteBusyId, setVoteBusyId] = useState<string | null>(null);
  const [commentBusyId, setCommentBusyId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const loadPosts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/feedback");
      const payload = (await res.json()) as FeedbackPayload;
      if (!res.ok) {
        setError(typeof payload.error === "string" ? payload.error : f.errorNetwork);
        return;
      }
      setPosts(Array.isArray(payload.posts) ? payload.posts : []);
      setViewerIsAdmin(Boolean(payload.viewer?.isAdmin));
    } catch {
      setError(f.errorNetwork);
    } finally {
      setLoading(false);
    }
  }, [f.errorNetwork]);

  useEffect(() => {
    if (!open) return;
    void loadPosts();
  }, [loadPosts, open]);

  const hasPosts = posts.length > 0;

  const visiblePosts = useMemo(() => posts, [posts]);

  async function submit() {
    const trimmed = message.trim();
    if (trimmed.length < 10) {
      setError(f.errorMinLength);
      return;
    }

    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() || undefined, message: trimmed }),
      });
      const payload = (await res.json()) as { success?: boolean; error?: string; id?: string };
      if (!res.ok) {
        setError(typeof payload.error === "string" ? payload.error : f.errorSendFailed);
        return;
      }
      setTitle("");
      setMessage("");
      await loadPosts();
    } catch {
      setError(f.errorNetwork);
    } finally {
      setBusy(false);
    }
  }

  async function vote(post: FeedbackPost, value: FeedbackVoteValue) {
    const nextValue = post.myVote === value ? null : value;
    setVoteBusyId(post.id);
    setError("");
    try {
      const res = await apiFetch(`/api/feedback/${post.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: nextValue }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof payload.error === "string" ? payload.error : f.errorSendFailed);
        return;
      }
      await loadPosts();
    } catch {
      setError(f.errorNetwork);
    } finally {
      setVoteBusyId(null);
    }
  }

  async function submitComment(postId: string) {
    const body = (commentDrafts[postId] ?? "").trim();
    if (body.length < 2) return;
    setCommentBusyId(postId);
    setError("");
    try {
      const res = await apiFetch(`/api/feedback/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof payload.error === "string" ? payload.error : f.errorSendFailed);
        return;
      }
      setCommentDrafts((current) => ({ ...current, [postId]: "" }));
      await loadPosts();
    } catch {
      setError(f.errorNetwork);
    } finally {
      setCommentBusyId(null);
    }
  }

  const layer = (
    <AppPushLayer
      open={open}
      onClose={() => setOpen(false)}
      ariaLabelledBy="feedback-forum-title"
      panelClassName="w-[min(100vw,34rem)] border-0 bg-[#F7F8FA] dark:bg-[#090B10]"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-border/70 bg-background/95 px-4 py-3 backdrop-blur dark:bg-card/95">
          <div className="min-w-0">
            <h2 id="feedback-forum-title" className="truncate text-base font-semibold text-foreground">
              {f.dialogTitle}
            </h2>
            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{f.sortHint}</p>
          </div>
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted"
            onClick={() => setOpen(false)}
            aria-label={c.close}
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
          <section className="rounded-2xl border border-border/70 bg-background p-3 shadow-sm dark:bg-card">
            <div className="flex items-start gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-classmates-azure/10 text-classmates-azure">
                <Plus className="h-4.5 w-4.5" strokeWidth={2.2} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold leading-tight text-foreground">{f.createPostTitle}</p>
                <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{f.forumIntro}</p>
              </div>
            </div>
            <div className="mt-3 space-y-2.5">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={busy}
                placeholder={f.titlePlaceholder}
                maxLength={120}
                className="h-10 rounded-xl bg-muted/30 text-[13px]"
              />
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={busy}
                placeholder={f.placeholder}
                rows={4}
                maxLength={4000}
                className="min-h-[100px] rounded-xl bg-muted/30 text-[13px]"
              />
              <div className="flex items-center justify-between gap-3">
                <p className="min-h-4 flex-1 text-[12px] text-destructive">{error}</p>
                <Button
                  type="button"
                  size="sm"
                  className="h-9 shrink-0 gap-1.5 rounded-full px-3 text-[13px]"
                  disabled={busy}
                  onClick={() => void submit()}
                >
                  <Send className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
                  {busy ? f.submitBusy : f.submit}
                </Button>
              </div>
            </div>
          </section>

          {loading ? (
            <div className="rounded-2xl border border-border/70 bg-background p-5 text-center text-[13px] text-muted-foreground dark:bg-card">
              {f.loading}
            </div>
          ) : !hasPosts ? (
            <div className="rounded-2xl border border-dashed border-border bg-background p-6 text-center dark:bg-card">
              <MessageCircle className="mx-auto h-7 w-7 text-muted-foreground/70" strokeWidth={2} aria-hidden />
              <p className="mt-2 text-[14px] font-semibold text-foreground">{f.emptyForum}</p>
            </div>
          ) : (
            visiblePosts.map((post) => (
              <article key={post.id} className="rounded-2xl border border-border/70 bg-background p-3 shadow-sm dark:bg-card">
                <div className="flex gap-2.5">
                  <PresetAvatar id={post.author.avatarUrl} size={34} className="h-[34px] w-[34px] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold leading-tight text-foreground">
                        {post.title}
                      </h3>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {post.score >= 0 ? `+${post.score}` : post.score}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[12px] text-muted-foreground">
                      {post.author.name} · {formatFeedbackDate(post.activeAt)}
                    </p>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground/90">
                  {post.message}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={voteBusyId === post.id}
                    onClick={() => void vote(post, "UP")}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition disabled:opacity-60",
                      post.myVote === "UP"
                        ? "border-classmates-azure/40 bg-classmates-azure/12 text-classmates-azure"
                        : "border-border bg-muted/30 text-muted-foreground hover:bg-muted",
                    )}
                    aria-label={f.upvote}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" strokeWidth={2.1} aria-hidden />
                    {post.up}
                  </button>
                  <button
                    type="button"
                    disabled={voteBusyId === post.id}
                    onClick={() => void vote(post, "DOWN")}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition disabled:opacity-60",
                      post.myVote === "DOWN"
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : "border-border bg-muted/30 text-muted-foreground hover:bg-muted",
                    )}
                    aria-label={f.downvote}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" strokeWidth={2.1} aria-hidden />
                    {post.down}
                  </button>
                  <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-muted/40 px-2.5 text-[12px] font-medium text-muted-foreground">
                    <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.1} aria-hidden />
                    {post.commentCount}
                  </span>
                </div>
                {post.comments.length > 0 ? (
                  <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
                    {post.comments.map((comment) => (
                      <div key={comment.id} className="flex gap-2">
                        <PresetAvatar id={comment.author.avatarUrl} size={24} className="h-6 w-6 shrink-0" />
                        <div className="min-w-0 flex-1 rounded-2xl bg-muted/35 px-3 py-2">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-[12px] font-semibold text-foreground">
                              {comment.author.name}
                            </span>
                            {comment.isOfficial ? (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-classmates-azure/12 px-1.5 py-0.5 text-[10px] font-semibold text-classmates-azure">
                                <BadgeCheck className="h-3 w-3" strokeWidth={2.2} aria-hidden />
                                {f.officialBadge}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-foreground/85">
                            {comment.body}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3">
                  <Input
                    value={commentDrafts[post.id] ?? ""}
                    onChange={(e) => setCommentDrafts((current) => ({ ...current, [post.id]: e.target.value }))}
                    placeholder={viewerIsAdmin ? f.adminCommentPlaceholder : f.commentPlaceholder}
                    maxLength={1200}
                    className="h-9 min-w-0 flex-1 rounded-full bg-muted/30 px-3 text-[13px]"
                  />
                  <Button
                    type="button"
                    size="icon"
                    className="h-9 w-9 shrink-0 rounded-full"
                    disabled={commentBusyId === post.id || !(commentDrafts[post.id] ?? "").trim()}
                    onClick={() => void submitComment(post.id)}
                    aria-label={f.reply}
                  >
                    <Send className="h-4 w-4" strokeWidth={2.1} aria-hidden />
                  </Button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </AppPushLayer>
  );

  if (variant === "header") {
    return (
      <>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            meSettingsRowFeedbackIconShellLargeClass,
            "transition-[filter,transform] hover:bg-transparent dark:hover:bg-transparent active:scale-[0.97]",
            "[@media(hover:hover)]:brightness-[1.04] dark:[@media(hover:hover)]:brightness-[1.07]",
          )}
          onClick={() => setOpen(true)}
          aria-label={f.sendFeedbackAria}
        >
          <MessageSquareText className="h-5 w-5" strokeWidth={2} aria-hidden />
        </Button>
        {layer}
      </>
    );
  }

  if (variant === "listRow") {
    return (
      <div className="contents">
        <button type="button" className={mePageRowButtonClass} onClick={() => setOpen(true)}>
          <div className={mePageRowLeadClass}>
            <span className={mePageIconShellClass}>
              <MessageSquareText className={mePageIconMutedClass} strokeWidth={2} aria-hidden />
            </span>
            <MePageSettingsRowLabel title={f.listRowTitle} subtitle={f.listRowSubtitle} />
          </div>
          <ChevronRight className={mePageChevronClass} strokeWidth={2} aria-hidden />
        </button>
        {layer}
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-classmates-edge bg-classmates-surface dark:border-border dark:bg-card",
          compact ? "p-3 shadow-[0_2px_10px_rgba(15,23,42,0.04)]" : "rounded-2xl p-4 shadow-[0_4px_14px_rgba(15,23,42,0.04)]",
        )}
      >
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex shrink-0 items-center justify-center rounded-full",
              meSettingsRowFeedbackIconSurfaceClass,
              compact ? "h-8 w-8" : "h-11 w-11",
            )}
          >
            <MessageSquareText
              className={compact ? "h-4 w-4" : "h-5 w-5"}
              strokeWidth={compact ? 2.25 : 2}
              aria-hidden
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn("font-semibold leading-tight text-foreground", compact ? "text-[13px]" : "text-[14px]")}>
              {f.cardTitle}
            </p>
            {!compact ? (
              <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{f.cardSubtitle}</p>
            ) : null}
          </div>
        </div>
        <div className="mt-3">
          <Button type="button" className={cn("w-full", compact && "h-9 text-[13px]")} onClick={() => setOpen(true)}>
            {f.writeButton}
          </Button>
        </div>
      </div>
      {layer}
    </>
  );
}
