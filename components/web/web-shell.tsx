"use client";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  CalendarCheck2,
  ChevronRight,
  Compass,
  HelpCircle,
  LogOut,
  MessageCircle,
  Plus,
  Smartphone,
  UserRound,
} from "lucide-react";
import { setAccessToken } from "@/lib/auth/client-access-token";
import { useWebResource } from "@/lib/web/client";
import { Avatar } from "./ui";
export type WebUser = {
  id: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
  school: string | null;
  verifiedStudent: boolean;
  onboardingComplete: boolean;
};
const UserContext = createContext<WebUser | null>(null);
export function useWebUser() {
  return useContext(UserContext)!;
}
const navigation = [
  {
    href: "/web/together",
    name: "同行",
    caption: "找到一起的人",
    icon: Compass,
  },
  {
    href: "/web/plans",
    name: "计划",
    caption: "让见面发生",
    icon: CalendarCheck2,
  },
  {
    href: "/web/calendar",
    name: "日历",
    caption: "留一点时间给生活",
    icon: CalendarDays,
  },
  {
    href: "/web/messages",
    name: "消息",
    caption: "从一声招呼开始",
    icon: MessageCircle,
  },
  { href: "/web/me", name: "我", caption: "你的校园名片", icon: UserRound },
];
export function WebShell({
  user,
  children,
}: {
  user: WebUser;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const unread = useWebResource<{
    unreadTotal: number;
  }>(user.onboardingComplete ? "/api/v1/inbox" : null, 30000);
  const [loggingOut, setLoggingOut] = useState(false);
  async function logout() {
    setLoggingOut(true);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("退出失败，请重试。");
      setAccessToken(null);
      router.replace("/web/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }
  return (
    <UserContext.Provider value={user}>
      <div className="sw-app">
        <aside className="sw-sidebar">
          <Link
            href="/web/together"
            className="sw-brand"
            aria-label="SideSeat 首页"
          >
            <span className="sw-brand-symbol">
              s<span>•</span>
            </span>
            <span>
              sideseat<span className="sw-brand-dot">.</span>
            </span>
          </Link>
          <p className="sw-sidebar-tagline">校园很大，刚好同路。</p>
          <nav className="sw-navigation" aria-label="主导航">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href as Route}
                className={pathname.startsWith(item.href) ? "is-active" : ""}
                aria-current={
                  pathname.startsWith(item.href) ? "page" : undefined
                }
              >
                <item.icon size={21} strokeWidth={1.7} />
                <span>
                  {item.name}
                  <small>{item.caption}</small>
                </span>
                {item.name === "消息" && (unread.data?.unreadTotal ?? 0) > 0 ? (
                  <b className="sw-count">{unread.data!.unreadTotal}</b>
                ) : null}
              </Link>
            ))}
          </nav>
          <Link
            href="/web/plans?create=1"
            onClick={() =>
              window.dispatchEvent(new Event("sideseat:create-plan"))
            }
            className="sw-button sw-primary sw-new-plan"
          >
            <Plus size={18} />
            发起一个计划
          </Link>
          <div className="sw-sidebar-note">
            <span className="sw-orbit" aria-hidden>
              ✳
            </span>
            <p>
              好时光，
              <br />
              从「一起」开始。
            </p>
            <span>MAKE ROOM FOR REAL LIFE</span>
          </div>
          <div className="sw-sidebar-bottom">
            <a href="sideseat://home">
              <Smartphone size={17} />在 iPhone 上继续
              <ArrowUpRight size={14} />
            </a>
            <Link href="/support">
              <HelpCircle size={17} />
              帮助与反馈
              <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="sw-account">
            <Link href="/web/me">
              <Avatar
                name={user.nickname || user.username}
                url={user.avatarUrl}
              />
              <span>
                <strong>{user.nickname || user.username}</strong>
                <small>
                  {user.school || "我的校园"}
                  {user.verifiedStudent ? " · 已认证" : ""}
                </small>
              </span>
            </Link>
            <button
              type="button"
              className="sw-icon-button"
              aria-label="退出登录"
              disabled={loggingOut}
              onClick={() => void logout()}
            >
              <LogOut size={17} />
            </button>
          </div>
        </aside>
        <div className="sw-workspace">
          <div className="sw-topbar">
            <div className="sw-breadcrumb">
              你的校园生活
              <ChevronRight size={13} />
              <span>
                {navigation.find((item) => pathname.startsWith(item.href))
                  ?.name ?? "计划详情"}
              </span>
            </div>
            <div className="sw-topbar-right">
              <span className="sw-live-dot" />与 iPhone 共用账号
              <span className="sw-topbar-divider" />
              <span>
                {new Intl.DateTimeFormat("zh-CN", {
                  month: "long",
                  day: "numeric",
                  weekday: "long",
                }).format(new Date())}
              </span>
            </div>
          </div>
          <main className="sw-main" id="web-main">
            {children}
          </main>
          <footer className="sw-footer">
            <span>让每一段校园时光，都有人同行。</span>
            <div>
              <Link href="/privacy">隐私</Link>
              <Link href="/support">支持</Link>
              <span>© SideSeat</span>
            </div>
          </footer>
        </div>
        <nav className="sw-mobile-nav" aria-label="移动端导航">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href as Route}
              className={pathname.startsWith(item.href) ? "is-active" : ""}
            >
              <item.icon size={21} />
              <span>{item.name}</span>
            </Link>
          ))}
        </nav>
      </div>
    </UserContext.Provider>
  );
}
