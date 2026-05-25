import { inboxChatListUlClassName } from "@/components/inbox/inbox-conversation-tile";
import { mePageCardClass } from "@/components/profile/me-settings-row";
import { cn } from "@/lib/utils";

export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-classmates-edge/70 dark:bg-muted/40",
        className,
      )}
      aria-hidden
    />
  );
}

type TabLoadingSurface = "background" | "warm" | "warmAlt";

function tabLoadingSurfaceClass(surface: TabLoadingSurface): string {
  switch (surface) {
    case "warm":
      return "bg-classmates-warm";
    case "warmAlt":
      return "bg-classmates-warm-alt dark:bg-background";
    default:
      return "bg-background";
  }
}

function TabLoadingShell({
  surface = "background",
  className,
  children,
}: {
  surface?: TabLoadingSurface;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        tabLoadingSurfaceClass(surface),
        className,
      )}
      aria-busy
      aria-live="polite"
    >
      {children}
    </div>
  );
}

/** Screen header chrome aligned with Inbox / Chats top pattern. */
function ScreenHeaderSkeleton({
  withAction,
  withToolbarAction,
  tabCols = 3,
}: {
  withAction?: boolean;
  /** Compact toolbar control on the right (e.g. Courses school select). */
  withToolbarAction?: boolean;
  tabCols?: 2 | 3;
}) {
  return (
    <header className="min-w-0 space-y-2">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div
          className="pointer-events-none invisible flex items-center justify-start gap-1.5"
          aria-hidden
        >
          <span className="inline-flex h-9 w-9 shrink-0" />
          {withAction && tabCols === 2 ? <span className="inline-flex h-9 w-9 shrink-0" /> : null}
        </div>
        <SkeletonBlock className="mx-auto h-7 w-28 rounded-lg" />
        <div className="flex justify-end gap-1.5">
          {withToolbarAction ? <SkeletonBlock className="h-8 w-14 rounded-lg" /> : null}
          {withAction ? (
            <>
              <SkeletonBlock className="h-9 w-9 rounded-full" />
              {tabCols === 2 ? <SkeletonBlock className="h-9 w-9 rounded-full" /> : null}
            </>
          ) : null}
        </div>
      </div>
      <nav
        className={cn(
          "grid w-full gap-0.5 rounded-[0.625rem] bg-classmates-rail/55 p-1 dark:bg-muted/55",
          tabCols === 3 ? "grid-cols-3" : "grid-cols-2",
        )}
        aria-hidden
      >
        {Array.from({ length: tabCols }).map((_, i) => (
          <SkeletonBlock key={i} className="h-8 rounded-[0.45rem]" />
        ))}
      </nav>
    </header>
  );
}

export function HomeTabLoadingSkeleton() {
  return (
    <TabLoadingShell className="gap-3">
      <div className="flex min-w-0 items-start gap-x-2 sm:gap-x-3">
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBlock className="h-6 w-40 max-w-full rounded-lg" />
          <SkeletonBlock className="h-4 w-28 rounded-lg" />
          <div className="flex gap-2 pt-0.5">
            <SkeletonBlock className="h-8 w-16 rounded-full" />
            <SkeletonBlock className="h-8 w-16 rounded-full" />
            <SkeletonBlock className="h-8 w-16 rounded-full" />
          </div>
        </div>
        <SkeletonBlock className="h-24 w-24 shrink-0 rounded-xl sm:h-24 sm:w-24" />
      </div>

      <div className="flex items-center justify-between gap-2">
        <SkeletonBlock className="h-9 w-9 rounded-full" />
        <SkeletonBlock className="h-5 w-36 rounded-lg" />
        <SkeletonBlock className="h-9 w-9 rounded-full" />
      </div>

      <SkeletonBlock className="h-10 w-full max-w-xs rounded-2xl" />

      <div className="flex min-h-[min(52vh,28rem)] flex-1 flex-col overflow-hidden rounded-2xl border border-classmates-edge/60 bg-white/80 dark:border-border dark:bg-card/80">
        <div className="flex border-b border-classmates-edge/50 dark:border-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-1 flex-col items-center gap-1 border-r border-classmates-edge/40 px-1 py-2 last:border-r-0 dark:border-border"
            >
              <SkeletonBlock className="h-3 w-6 rounded-md" />
              <SkeletonBlock className="h-5 w-5 rounded-md" />
            </div>
          ))}
        </div>
        <div className="relative flex-1 p-2">
          <SkeletonBlock className="absolute left-2 top-3 h-[72%] w-10 rounded-lg" />
          <div className="ml-12 flex h-full gap-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonBlock key={i} className="min-h-[12rem] flex-1 rounded-lg opacity-80" />
            ))}
          </div>
        </div>
      </div>
    </TabLoadingShell>
  );
}

export function DiscoverTabLoadingSkeleton() {
  return (
    <TabLoadingShell surface="warm" className="gap-3">
      <ScreenHeaderSkeleton withAction tabCols={2} />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-2xl border border-[#E7E0D6] bg-white px-4 py-3.5 shadow-[0_4px_16px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card"
          >
            <div className="mb-2.5 flex items-center gap-2.5">
              <SkeletonBlock className="h-9 w-9 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <SkeletonBlock className="h-3.5 w-28 max-w-[70%] rounded-lg" />
                <SkeletonBlock className="h-3 w-20 rounded-md" />
              </div>
            </div>
            <SkeletonBlock className="mb-2 h-4 w-4/5 rounded-lg" />
            <SkeletonBlock className="h-3 w-full rounded-lg" />
            <SkeletonBlock className="mt-1.5 h-3 w-[88%] rounded-lg" />
          </div>
        ))}
      </div>
    </TabLoadingShell>
  );
}

function InboxConversationRowSkeleton() {
  return (
    <li className="flex list-none items-center gap-3 px-3 py-3">
      <SkeletonBlock className="h-11 w-11 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <SkeletonBlock className="h-4 w-32 max-w-[70%] rounded-lg" />
        <SkeletonBlock className="h-3 w-full max-w-[90%] rounded-lg" />
      </div>
      <SkeletonBlock className="h-3 w-10 shrink-0 rounded-md" />
    </li>
  );
}

export function InboxTabLoadingSkeleton() {
  return (
    <TabLoadingShell className="gap-3">
      <header className="min-w-0 space-y-2">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <span className="h-9 w-9" aria-hidden />
          <SkeletonBlock className="mx-auto h-7 w-28 rounded-lg" />
          <div className="flex justify-end">
            <SkeletonBlock className="h-9 w-9 rounded-full" />
          </div>
        </div>
        <nav className="grid w-full grid-cols-3 gap-1.5" aria-hidden>
          <SkeletonBlock className="h-10 rounded-full" />
          <SkeletonBlock className="h-10 rounded-full" />
          <SkeletonBlock className="h-10 rounded-full" />
        </nav>
      </header>

      <ul className={inboxChatListUlClassName} aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <InboxConversationRowSkeleton key={i} />
        ))}
      </ul>
    </TabLoadingShell>
  );
}

export function CoursesTabLoadingSkeleton() {
  return (
    <TabLoadingShell className="gap-3 pb-4">
      <ScreenHeaderSkeleton withToolbarAction tabCols={3} />
      <SkeletonBlock className="h-20 w-full rounded-2xl" />
      <SkeletonBlock className="h-9 w-full rounded-full" />
      <ul className={inboxChatListUlClassName} aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="flex list-none items-center gap-3 px-3 py-3.5">
            <SkeletonBlock className="h-10 w-10 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-24 rounded-lg" />
              <SkeletonBlock className="h-3 w-full max-w-[85%] rounded-lg" />
            </div>
          </li>
        ))}
      </ul>
    </TabLoadingShell>
  );
}

export function ProfileTabLoadingSkeleton() {
  return (
    <TabLoadingShell surface="warmAlt" className="-mx-3 gap-4 px-5 pb-4 pt-1">
      <div className={cn(mePageCardClass, "overflow-hidden p-4")}>
        <div className="flex gap-3.5">
          <SkeletonBlock className="h-[4.5rem] w-[4.5rem] shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2 pt-0.5">
            <SkeletonBlock className="h-5 w-36 max-w-full rounded-lg" />
            <SkeletonBlock className="h-3 w-full max-w-[85%] rounded-lg" />
            <SkeletonBlock className="h-3 w-full max-w-[90%] rounded-lg" />
          </div>
        </div>
        <div className="mt-3.5 space-y-2 border-t border-classmates-edge/70 pt-3.5 dark:border-border/60">
          <SkeletonBlock className="h-3 w-16 rounded-md" />
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonBlock key={i} className="aspect-square w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <SkeletonBlock className="h-3 w-24 rounded-md" />
        <div className={cn(mePageCardClass, "divide-y divide-classmates-edge/60 overflow-hidden dark:divide-border")}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <SkeletonBlock className="h-9 w-9 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <SkeletonBlock className="h-4 w-28 rounded-lg" />
                <SkeletonBlock className="h-3 w-40 max-w-full rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </TabLoadingShell>
  );
}

/** Generic fallback for routes without a dedicated skeleton. */
export function AppTabLoadingFallback() {
  return (
    <TabLoadingShell className="gap-3">
      <div className="flex items-center justify-between gap-3">
        <SkeletonBlock className="h-8 w-32" />
        <SkeletonBlock className="h-9 w-9 rounded-full" />
      </div>
      <SkeletonBlock className="min-h-[12rem] flex-1 w-full" />
    </TabLoadingShell>
  );
}
