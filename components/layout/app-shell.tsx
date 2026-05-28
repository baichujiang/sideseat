"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { Calendar, Inbox, Plus, UsersRound, UserRound, type LucideIcon } from "lucide-react";

import { ProductTutorialGate, type ProductTutorialGateContext } from "@/components/app/product-tutorial-gate";
import { InboxUnreadBadge } from "@/components/inbox/inbox-unread-badge";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import {
  TAB_KEEP_ALIVE_PATHS,
  TabKeepAliveProvider,
  tabKeepAliveKeyFromPathname,
  useTabKeepAliveNavigation,
} from "@/components/layout/tab-keep-alive";
import { OfflineBanner } from "@/components/offline/offline-banner";
import { PwaInstallBar } from "@/components/pwa/pwa-install-bar";
import { useCapacitorNative } from "@/hooks/use-capacitor-native";
import { apiFetch } from "@/lib/auth/api-fetch";
import { APP_NAME } from "@/lib/constants/app";
import { cn } from "@/lib/utils";

/** Flat bar: light tint only (no nested “card” / shadow), like native tab selection. */
const navActiveTab =
  "rounded-2xl bg-classmates-blue-soft text-classmates-blue dark:bg-blue-500/15 dark:text-blue-400";
const navInactiveTab =
  "group rounded-2xl text-[#6B7280] active:bg-black/[0.04] dark:text-muted-foreground dark:active:bg-white/[0.06] [@media(hover:hover)]:hover:bg-black/[0.04] dark:[@media(hover:hover)]:hover:bg-white/[0.06]";

const navActiveSide =
  "rounded-xl bg-classmates-blue-soft text-classmates-blue dark:bg-blue-500/15 dark:text-blue-400";
const navInactiveSide =
  "group rounded-xl text-[#6B7280] [@media(hover:hover)]:hover:bg-black/[0.04] dark:text-muted-foreground dark:[@media(hover:hover)]:hover:bg-white/[0.06]";

type NavItem = { href: Route; label: string; icon: LucideIcon };

function ShellNavLink({
  item,
  pathname,
  liveUnreadTotal,
  variant,
}: {
  item: NavItem;
  pathname: string;
  liveUnreadTotal: number;
  variant: "bottom" | "side";
}) {
  const Icon = item.icon;
  const href = item.href;
  const tab = tabKeepAliveKeyFromPathname(item.href);
  const { getSnapshot, requestTab } = useTabKeepAliveNavigation();
  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!tab) return;
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;
    if (!getSnapshot(tab)) return;
    requestTab(tab);
  };

  if (variant === "side") {
    return (
      <Link
        href={href}
        aria-current={isActive ? "page" : undefined}
        onClick={handleClick}
        className={cn(
          "flex min-h-[2.75rem] items-center gap-3 px-3 py-2 text-sm font-semibold transition-[background-color,color] duration-150 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          isActive ? navActiveSide : navInactiveSide,
        )}
      >
        <span className="relative inline-flex shrink-0">
          <Icon
            className={cn(
              "h-5 w-5 transition-colors duration-200",
              isActive
                ? "text-classmates-blue dark:text-blue-400"
                : "text-[#6B7280] group-hover:text-classmates-ink dark:text-muted-foreground",
            )}
            strokeWidth={2}
            aria-hidden
          />
          {item.href === "/inbox" ? (
            <span className="pointer-events-none absolute -right-1.5 -top-1.5">
              <InboxUnreadBadge count={liveUnreadTotal} variant="countBrand" />
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            "truncate transition-colors duration-200",
            isActive
              ? "font-semibold text-classmates-blue dark:text-blue-400"
              : "text-[#6B7280] group-hover:text-classmates-ink dark:text-muted-foreground",
          )}
        >
          {item.label}
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      replace
      aria-current={isActive ? "page" : undefined}
      onClick={handleClick}
      className={cn(
        "flex min-h-[3rem] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1 text-[10px] font-semibold leading-tight transition-[background-color,color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isActive ? navActiveTab : navInactiveTab,
      )}
    >
      <span className="relative inline-flex shrink-0">
        <Icon
          className={cn(
            "h-5 w-5 transition-colors duration-200",
            isActive
              ? "text-classmates-blue dark:text-blue-400"
              : "text-[#6B7280] group-hover:text-classmates-ink dark:text-muted-foreground",
          )}
          strokeWidth={2}
          aria-hidden
        />
        {item.href === "/inbox" ? (
          <span className="pointer-events-none absolute -right-1 -top-1">
            <InboxUnreadBadge count={liveUnreadTotal} variant="countBrand" />
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "truncate transition-colors duration-200",
          isActive
            ? "font-semibold text-classmates-blue dark:text-blue-400"
            : "text-[#6B7280] group-hover:text-classmates-ink dark:text-muted-foreground",
        )}
      >
        {item.label}
      </span>
    </Link>
  );
}

function ShellCreatePostButton({
  label,
  onClick,
  variant,
}: {
  label: string;
  onClick: () => void;
  variant: "bottom" | "side";
}) {
  if (variant === "side") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex min-h-[2.75rem] w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-[background-color,box-shadow,transform]",
          "bg-classmates-blue text-white shadow-[0_10px_24px_-14px_rgba(37,99,235,0.95)] active:scale-[0.99]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "[@media(hover:hover)]:hover:bg-classmates-blue/92",
        )}
        aria-label={label}
      >
        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
          <Plus className="h-5 w-5" strokeWidth={2.5} aria-hidden />
        </span>
        <span className="truncate">{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex min-h-[3rem] min-w-0 flex-1 items-center justify-center rounded-2xl px-1 py-1",
        "text-classmates-blue transition-[background-color,color] duration-150 ease-out active:bg-classmates-blue-soft dark:text-blue-400 dark:active:bg-blue-500/15",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "[@media(hover:hover)]:hover:bg-classmates-blue-soft dark:[@media(hover:hover)]:hover:bg-blue-500/15",
      )}
      aria-label={label}
    >
      <span
        className={cn(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          "bg-classmates-blue text-white shadow-[0_8px_18px_-12px_rgba(37,99,235,0.9)]",
          "transition-[background-color,transform] group-active:scale-95",
          "[@media(hover:hover)]:group-hover:bg-classmates-blue/92",
        )}
      >
        <Plus
          className="h-5 w-5"
          strokeWidth={2.7}
          aria-hidden
        />
      </span>
    </button>
  );
}

/** Mobile shell: bottom tab bar; desktop browser: left rail + full-width content. */
export function AppShell({
  children,
  inboxUnreadTotal = 0,
  productTutorialContext = null,
}: {
  children: React.ReactNode;
  /** Total unread DM + course-room messages (same as inbox bundle). */
  inboxUnreadTotal?: number;
  productTutorialContext?: ProductTutorialGateContext | null;
}) {
  const cacheScope = productTutorialContext?.userId ?? "anonymous";

  return (
    <TabKeepAliveProvider cacheScope={cacheScope}>
      <AppShellContent
        inboxUnreadTotal={inboxUnreadTotal}
        productTutorialContext={productTutorialContext}
      >
        {children}
      </AppShellContent>
    </TabKeepAliveProvider>
  );
}

function AppShellContent({
  children,
  inboxUnreadTotal = 0,
  productTutorialContext = null,
}: {
  children: React.ReactNode;
  /** Total unread DM + course-room messages (same as inbox bundle). */
  inboxUnreadTotal?: number;
  productTutorialContext?: ProductTutorialGateContext | null;
}) {
  const { messages: m } = useLocaleContext();
  const navItems = [
    { href: "/home", label: m.nav.home, icon: Calendar },
    { href: "/discover", label: m.nav.discoverTab, icon: UsersRound },
    { href: "/inbox", label: m.nav.chats, icon: Inbox },
    { href: "/profile", label: m.nav.me, icon: UserRound },
  ] satisfies NavItem[];

  const router = useRouter();
  const pathname = usePathname();
  const isNativeApp = useCapacitorNative();
  const { pendingTab, getSnapshot } = useTabKeepAliveNavigation();
  const [liveUnreadTotal, setLiveUnreadTotal] = useState(inboxUnreadTotal);
  const displayedPathname = pendingTab ? TAB_KEEP_ALIVE_PATHS[pendingTab] : pathname;
  const leadingNavItems = navItems.slice(0, 2);
  const trailingNavItems = navItems.slice(2);
  const currentTopLevelTab = tabKeepAliveKeyFromPathname(pathname);

  const openDiscoverCreatePost = useCallback(() => {
    if (pathname === "/discover") {
      window.dispatchEvent(new Event("sideseat:discover-create-post"));
      return;
    }
    const target = "/discover?create=post" as Route;
    if (currentTopLevelTab) {
      router.push(target);
      return;
    }
    router.replace(target);
  }, [currentTopLevelTab, pathname, router]);

  const refreshUnreadTotal = useCallback(async () => {
    const response = await apiFetch("/api/inbox/unread-total", {
      cache: "no-store",
    }).catch(() => null);
    if (!response?.ok) return;

    const payload = await response.json().catch(() => null);
    const next = payload?.data?.unreadTotal;
    if (typeof next === "number") {
      setLiveUnreadTotal(next);
    }
  }, []);

  useEffect(() => {
    void refreshUnreadTotal();

    const id = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void refreshUnreadTotal();
      }
    }, 10000);
    const onFocus = () => void refreshUnreadTotal();
    const onUnreadChanged = () => void refreshUnreadTotal();

    window.addEventListener("focus", onFocus);
    window.addEventListener("sideseat:inbox-unread-changed", onUnreadChanged);
    document.addEventListener("visibilitychange", onUnreadChanged);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("sideseat:inbox-unread-changed", onUnreadChanged);
      document.removeEventListener("visibilitychange", onUnreadChanged);
    };
  }, [refreshUnreadTotal]);

  /** Full-height drill-ins: hide tab bar (chat thread, course chat, peer profile). */
  const isChatThread =
    /^\/connections\/[^/]+$/.test(displayedPathname) ||
    /^\/users\/[^/]+$/.test(displayedPathname) ||
    /^\/courses\/[^/]+\/chat$/.test(displayedPathname) ||
    /^\/groups\/[^/]+$/.test(displayedPathname);

  const usesPrimaryTabSurface =
    displayedPathname === "/home" ||
    displayedPathname === "/discover" ||
    displayedPathname === "/inbox" ||
    displayedPathname === "/profile";
  const shellSurface =
    usesPrimaryTabSurface && !isChatThread
      ? "bg-classmates-warm-alt dark:bg-background"
      : "bg-background";
  const showBottomNav = !isChatThread && !isNativeApp;
  const showSideNav = showBottomNav;
  const showCreatePostAction = usesPrimaryTabSurface && !isChatThread;
  const pendingSnapshot = pendingTab ? getSnapshot(pendingTab) : null;
  const showPendingSnapshot = Boolean(pendingTab && pendingSnapshot && currentTopLevelTab !== pendingTab);

  return (
    <div
      data-app-shell
      className={cn(
        "mx-auto flex min-w-0 max-w-md flex-col",
        "md:max-w-none md:w-full",
        "lg:flex-row lg:max-w-none",
        shellSurface,
        "h-[var(--app-viewport-height,100dvh)] max-h-[var(--app-viewport-height,100dvh)] overflow-hidden",
        !isChatThread &&
          "[--bottom-nav-clearance:calc(160px+var(--safe-bottom))] lg:[--bottom-nav-clearance:max(1.25rem,var(--safe-bottom))]",
      )}
    >
      <ProductTutorialGate context={productTutorialContext} />
      {showSideNav ? (
        <nav
          className={cn(
            "hidden shrink-0 flex-col border-r border-classmates-edge/80 bg-white/95 backdrop-blur-xl supports-[backdrop-filter]:bg-white/92",
            "dark:border-border/50 dark:bg-background/92",
            "lg:flex lg:w-56 xl:w-60",
            "pb-[max(0.75rem,var(--safe-bottom))] pt-[max(0.75rem,var(--safe-top))]",
          )}
          aria-label={m.nav.mainNavAria}
        >
          <div className="px-4 pb-4 pt-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {APP_NAME}
            </p>
          </div>
          {showCreatePostAction ? (
            <div className="px-2 pb-3">
              <ShellCreatePostButton
                label={m.nav.createPost}
                onClick={openDiscoverCreatePost}
                variant="side"
              />
            </div>
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col gap-0.5 px-2">
            {navItems.map((item) => (
              <ShellNavLink
                key={item.href}
                item={item}
                pathname={displayedPathname}
                liveUnreadTotal={liveUnreadTotal}
                variant="side"
              />
            ))}
          </div>
        </nav>
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <main
          data-app-shell-scroll
          className={cn(
            "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden [touch-action:pan-y]",
            shellSurface,
            isChatThread
              ? "px-0 pb-0 pt-[max(0.25rem,var(--safe-top))]"
              : cn(
                  "overflow-y-auto overscroll-y-contain px-3 pb-[var(--bottom-nav-clearance)] pt-[max(0.75rem,var(--safe-top))]",
                  "md:px-6 lg:px-8 xl:px-10 2xl:px-12",
                ),
          )}
        >
          <OfflineBanner />
          {showPendingSnapshot ? pendingSnapshot?.node : children}
        </main>
        {showBottomNav ? <PwaInstallBar /> : null}
        {showBottomNav ? (
          <nav
            className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-md -translate-x-1/2 items-stretch border-t border-classmates-edge/80 bg-white/95 px-1 pb-[max(0.5rem,var(--safe-bottom))] pt-1.5 backdrop-blur-xl supports-[backdrop-filter]:bg-white/92 dark:border-border/50 dark:bg-background/92 lg:hidden"
            aria-label={m.nav.mainNavAria}
          >
            {leadingNavItems.map((item) => (
              <ShellNavLink
                key={item.href}
                item={item}
                pathname={displayedPathname}
                liveUnreadTotal={liveUnreadTotal}
                variant="bottom"
              />
            ))}
            {showCreatePostAction ? (
              <ShellCreatePostButton
                label={m.nav.createPost}
                onClick={openDiscoverCreatePost}
                variant="bottom"
              />
            ) : null}
            {trailingNavItems.map((item) => (
              <ShellNavLink
                key={item.href}
                item={item}
                pathname={displayedPathname}
                liveUnreadTotal={liveUnreadTotal}
                variant="bottom"
              />
            ))}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
