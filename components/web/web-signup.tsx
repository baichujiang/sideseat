"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { schoolOptions } from "@/lib/constants/schools";
import { messageOf, webRequest } from "@/lib/web/client";
import { setAccessToken } from "@/lib/auth/client-access-token";
import { ErrorNotice, Field } from "./ui";
import { WebBrand } from "./web-brand";
export function WebSignup() {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await webRequest("/api/auth/signup", "POST", {
        displayName: form.get("displayName"),
        username: form.get("username"),
        password: form.get("password"),
        school: form.get("school"),
        studentStatus: "CURRENT_STUDENT",
        degreeLevel: form.get("degreeLevel"),
        semester: Number(form.get("semester")),
      });
      setAccessToken(null);
      router.replace("/web/me");
      router.refresh();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="sw-signup">
      <Link href="/web/login" className="sw-brand">
        <WebBrand />
      </Link>
      <h1>从这里，认识同路的人。</h1>
      <p className="sw-subtitle" style={{ marginBottom: 25 }}>
        已有 iPhone 账号？直接登录，就能接着使用原来的资料。
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <Field label="大家怎么称呼你？">
          <input
            name="displayName"
            autoComplete="nickname"
            minLength={2}
            maxLength={32}
            required
          />
        </Field>
        <Field label="登录用户名" hint="2–32 位字母、数字、下划线或短横线。">
          <input
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            pattern="[A-Za-z0-9_-]{2,32}"
            required
          />
        </Field>
        <Field label="密码">
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>
        <div className="sw-form-row">
          <Field label="学校">
            <select name="school">
              {schoolOptions.map((school) => (
                <option key={school.value} value={school.value}>
                  {school.shortLabel}
                </option>
              ))}
            </select>
          </Field>
          <Field label="学位">
            <select name="degreeLevel">
              <option value="BACHELOR">本科</option>
              <option value="MASTER">硕士</option>
              <option value="OTHER">其他</option>
            </select>
          </Field>
        </div>
        <Field label="当前学期">
          <input
            name="semester"
            type="number"
            min={1}
            max={20}
            defaultValue={1}
            required
          />
        </Field>
        <ErrorNotice message={error} />
        <button
          className="sw-button sw-primary"
          style={{ width: "100%" }}
          disabled={busy}
        >
          {busy ? "创建中…" : "创建 SideSeat 账号"}
          <ArrowRight size={15} />
        </button>
      </form>
      <p>
        已有账号？<Link href="/web/login">登录</Link>
      </p>
      <p className="sw-muted">创建账号后，可以继续完善语言和学生认证。</p>
    </main>
  );
}
