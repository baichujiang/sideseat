"use client";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  BookOpen,
  Coffee,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { setAccessToken } from "@/lib/auth/client-access-token";
import { webRequest, messageOf } from "@/lib/web/client";
import { ErrorNotice, Field } from "./ui";
import { WebBrand } from "./web-brand";
import { PasswordField } from "./password-field";
export function WebLogin({
  returnTo = "/web/together",
}: {
  returnTo?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await webRequest<{
        accessToken: string;
      }>("/api/auth/login", "POST", {
        identifier: form.get("identifier"),
        password: form.get("password"),
      });
      setAccessToken(null);
      router.replace(returnTo as Route);
      router.refresh();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="sw-login">
      <section className="sw-login-story">
        <Link href="/web" className="sw-brand">
          <WebBrand />
        </Link>
        <div className="sw-login-copy">
          <p className="sw-eyebrow">LESS SCROLLING. MORE LIVING.</p>
          <h1>
            想做的事，
            <br />
            找个人一起。
          </h1>
          <p>
            一场自习、一杯咖啡、一次说走就走。
            <br />
            让校园里的「下次吧」，变成「一起吧」。
          </p>
          <div className="sw-login-illustration" aria-hidden>
            <div className="sw-coffee-circle">
              <Coffee size={65} strokeWidth={1.3} />
            </div>
            <div className="sw-story-chip chip-one">
              <BookOpen size={20} />
              图书馆，一起？<span>→</span>
            </div>
            <div className="sw-story-chip chip-two">
              <UsersRound size={20} />
              刚好都有空<span>✓</span>
            </div>
            <Sparkles className="sw-story-star" size={45} strokeWidth={1} />
            <span className="sw-story-dot" />
          </div>
        </div>
        <span className="sw-login-footnote">
          从共同的校园，走向真实的见面。
        </span>
      </section>
      <section className="sw-login-form">
        <div>
          <p className="sw-eyebrow">YOUR CAMPUS, CONNECTED</p>
          <h2>欢迎回来。</h2>
          <p className="sw-subtitle">
            使用你的 SideSeat 账号，接着上次的故事。
          </p>
          <form onSubmit={(event) => void submit(event)}>
            <Field label="用户名或邮箱">
              <input
                name="identifier"
                autoComplete="username"
                autoCapitalize="none"
                required
                placeholder="输入手机端使用的账号"
              />
            </Field>
            <PasswordField
              label="密码"
              name="password"
              autoComplete="current-password"
              required
              placeholder="输入密码"
            />
            <Link
              href="/forgot-password?returnTo=%2Fweb%2Flogin"
              className="sw-forgot"
            >
              忘记密码？
            </Link>
            <ErrorNotice message={error} />
            <button
              type="submit"
              className="sw-button sw-primary"
              disabled={busy}
            >
              {busy ? "正在登录…" : "登录 SideSeat"}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="sw-auth-switch">
            第一次来？<Link href="/web/signup">创建账号</Link>
          </p>
          <p className="sw-login-trust">
            <ShieldCheck size={16} />
            一个账号，手机与网页共用你的计划和日历。
          </p>
          <div className="sw-login-links">
            <Link href="/privacy">隐私政策</Link>
            <Link href="/support">帮助与支持</Link>
            <a href="sideseat://home">打开 iPhone App ↗</a>
          </div>
        </div>
      </section>
    </main>
  );
}
