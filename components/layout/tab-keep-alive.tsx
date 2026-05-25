"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

export const TAB_KEEP_ALIVE_PATHS = {
  home: "/home",
  discover: "/discover",
  inbox: "/inbox",
  profile: "/profile",
} as const;

export type TabKeepAliveKey = keyof typeof TAB_KEEP_ALIVE_PATHS;

type TabSnapshot = {
  node: ReactNode;
  cachedAt: number;
};

type TabKeepAliveContextValue = {
  pendingTab: TabKeepAliveKey | null;
  getSnapshot: (tab: TabKeepAliveKey) => TabSnapshot | null;
  rememberSnapshot: (tab: TabKeepAliveKey, node: ReactNode) => void;
  requestTab: (tab: TabKeepAliveKey) => void;
};

const TabKeepAliveContext = createContext<TabKeepAliveContextValue | null>(null);

function normalizePathname(pathname: string | null): string {
  if (!pathname) return "/";
  const [pathOnly = "/"] = pathname.split(/[?#]/);
  if (pathOnly.length > 1 && pathOnly.endsWith("/")) {
    return pathOnly.slice(0, -1);
  }
  return pathOnly || "/";
}

export function tabKeepAliveKeyFromPathname(pathname: string | null): TabKeepAliveKey | null {
  const normalized = normalizePathname(pathname);
  for (const [tab, path] of Object.entries(TAB_KEEP_ALIVE_PATHS)) {
    if (normalized === path) return tab as TabKeepAliveKey;
  }
  return null;
}

export function TabKeepAliveProvider({
  cacheScope,
  children,
}: {
  cacheScope: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const cacheScopeRef = useRef(cacheScope);
  const [snapshots, setSnapshots] = useState<Partial<Record<TabKeepAliveKey, TabSnapshot>>>({});
  const [pendingTab, setPendingTab] = useState<TabKeepAliveKey | null>(null);

  useEffect(() => {
    if (cacheScopeRef.current === cacheScope) return;
    cacheScopeRef.current = cacheScope;
    setSnapshots({});
    setPendingTab(null);
  }, [cacheScope]);

  useEffect(() => {
    if (!pendingTab) return;
    const normalized = normalizePathname(pathname);
    const pendingPath = TAB_KEEP_ALIVE_PATHS[pendingTab];

    if (normalized !== pendingPath && tabKeepAliveKeyFromPathname(normalized) == null) {
      setPendingTab(null);
    }
  }, [pathname, pendingTab]);

  const getSnapshot = useCallback(
    (tab: TabKeepAliveKey) => snapshots[tab] ?? null,
    [snapshots],
  );

  const rememberSnapshot = useCallback((tab: TabKeepAliveKey, node: ReactNode) => {
    setSnapshots((current) => {
      const existing = current[tab];
      if (existing?.node === node) return current;
      return {
        ...current,
        [tab]: { node, cachedAt: Date.now() },
      };
    });
    setPendingTab((current) => (current === tab ? null : current));
  }, []);

  const requestTab = useCallback((tab: TabKeepAliveKey) => {
    setPendingTab(tab);
  }, []);

  const value = useMemo(
    () => ({
      pendingTab,
      getSnapshot,
      rememberSnapshot,
      requestTab,
    }),
    [getSnapshot, pendingTab, rememberSnapshot, requestTab],
  );

  return <TabKeepAliveContext.Provider value={value}>{children}</TabKeepAliveContext.Provider>;
}

export function useTabKeepAliveNavigation() {
  const context = useContext(TabKeepAliveContext);
  return {
    pendingTab: context?.pendingTab ?? null,
    getSnapshot: context?.getSnapshot ?? (() => null),
    requestTab: context?.requestTab ?? (() => undefined),
  };
}

export function TabKeepAliveSnapshot({
  tab,
  children,
}: {
  tab: TabKeepAliveKey;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const context = useContext(TabKeepAliveContext);
  const rememberSnapshot = context?.rememberSnapshot;

  useEffect(() => {
    if (!rememberSnapshot) return;
    if (normalizePathname(pathname) !== TAB_KEEP_ALIVE_PATHS[tab]) return;
    rememberSnapshot(tab, children);
  }, [children, pathname, rememberSnapshot, tab]);

  return <>{children}</>;
}

export function TabCachedLoading({
  tab,
  fallback,
}: {
  tab: TabKeepAliveKey;
  fallback: ReactNode;
}) {
  const pathname = usePathname();
  const context = useContext(TabKeepAliveContext);
  const snapshot = context?.getSnapshot(tab) ?? null;
  const isTopLevelTarget = normalizePathname(pathname) === TAB_KEEP_ALIVE_PATHS[tab];
  const shouldUseCached = snapshot && (isTopLevelTarget || context?.pendingTab === tab);

  return <>{shouldUseCached ? snapshot.node : fallback}</>;
}
