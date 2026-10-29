"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { StudentVerificationStatus } from "@prisma/client";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  GraduationCap,
  ImagePlus,
  Languages,
  LockKeyhole,
  MessageSquare,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { StudentVerificationForm } from "@/components/forms/student-verification-form";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { apiFetch } from "@/lib/auth/api-fetch";
import {
  LANGUAGE_TAG_OPTIONS,
  LANGUAGE_PROFICIENCY_OPTIONS,
} from "@/lib/constants/languages";
import {
  messageOf,
  refreshWebData,
  useWebResource,
  webRequest,
} from "@/lib/web/client";
import {
  Avatar,
  Empty,
  ErrorNotice,
  Field,
  Loading,
  Modal,
  PageHeading,
} from "./ui";
type Profile = {
  id: string;
  username: string;
  nickname: string | null;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  tagline: string | null;
  school: string | null;
  major: string | null;
  semester: number | null;
  degreeLevel: string | null;
  verifiedStudent: boolean;
  studentVerificationStatus: StudentVerificationStatus;
  languages: {
    tag: string;
    proficiency: string;
  }[];
  privacy: {
    hideFromDiscovery: boolean;
    hideFromCourseMembers: boolean;
    contactInfoOptIn: boolean;
  };
  contacts: {
    wechatHandle: string | null;
    whatsappHandle: string | null;
    telegramHandle: string | null;
    instagramHandle: string | null;
  };
  lifePhotos: {
    id: string;
    url: string;
  }[];
};
type Course = {
  id: string;
  name: string;
  code: string | null;
  semesterLabel: string;
  memberCount: number;
  viewer: {
    enrolled: boolean;
    saved: boolean;
  };
  sessions: {
    weekday: string;
    startMinute: number;
    endMinute: number;
    location: string | null;
  }[];
};
function Courses() {
  const [scope, setScope] = useState("enrolled"),
    [query, setQuery] = useState(""),
    [draft, setDraft] = useState(""),
    [manual, setManual] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState<string | null>(null),
    [remove, setRemove] = useState<Course | null>(null);
  const data = useWebResource<{
    courses: Course[];
    nextCursor: string | null;
  }>(`/api/v1/courses?scope=${scope}&q=${encodeURIComponent(query)}&limit=50`);
  async function enrollment(course: Course) {
    setBusy(course.id);
    setError("");
    try {
      await webRequest(
        `/api/v1/courses/${course.id}/enrollment`,
        course.viewer.enrolled ? "DELETE" : "POST",
        {},
      );
      data.reload();
      refreshWebData();
      setRemove(null);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <div className="sw-panel-heading">
        <div>
          <h2>我的课程</h2>
          <p className="sw-muted">加入课程后，课表和手机端一起更新。</p>
        </div>
        <button
          className="sw-button sw-soft sw-small"
          onClick={() => setManual(true)}
        >
          <Plus size={14} />
          手动添加
        </button>
      </div>
      <div className="sw-tabs">
        {[
          ["enrolled", "正在修读"],
          ["popular", "查找课程"],
          ["saved", "已收藏"],
          ["archived", "已归档"],
        ].map(([key, name]) => (
          <button
            key={key}
            className={scope === key ? "is-active" : ""}
            onClick={() => setScope(key)}
          >
            {name}
          </button>
        ))}
      </div>
      <form
        className="sw-course-search"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(draft);
        }}
      >
        <label className="sw-calendar-search">
          <Search size={15} />
          <input
            placeholder="课程名称或编号"
            aria-label="搜索课程"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <button className="sw-button sw-small">搜索</button>
      </form>
      <ErrorNotice message={error || data.error} retry={data.reload} />
      {data.loading ? (
        <Loading />
      ) : data.data?.courses.length ? (
        data.data.courses.map((course) => (
          <article className="sw-course-row" key={course.id}>
            <span className="sw-activity-icon STUDY">
              <BookOpen size={21} />
            </span>
            <div className="sw-grow">
              <h3>{course.name}</h3>
              <p>
                {course.code || "自定义课程"} · {course.semesterLabel} ·{" "}
                {course.memberCount} 位同学
              </p>
              {course.sessions.length ? (
                <small>
                  {course.sessions
                    .map(
                      (session) =>
                        `${{ MON: "周一", TUE: "周二", WED: "周三", THU: "周四", FRI: "周五", SAT: "周六", SUN: "周日" }[session.weekday] ?? session.weekday} ${String(Math.floor(session.startMinute / 60)).padStart(2, "0")}:${String(session.startMinute % 60).padStart(2, "0")}`,
                    )
                    .join(" · ")}
                </small>
              ) : null}
            </div>
            <button
              className={`sw-button sw-small ${course.viewer.enrolled ? "" : "sw-soft"}`}
              disabled={busy === course.id || scope === "archived"}
              onClick={() =>
                course.viewer.enrolled
                  ? setRemove(course)
                  : void enrollment(course)
              }
            >
              {course.viewer.enrolled
                ? "退出课程"
                : scope === "archived"
                  ? "历史记录"
                  : "加入课程"}
            </button>
          </article>
        ))
      ) : (
        <Empty
          icon={BookOpen}
          title={
            scope === "enrolled"
              ? "课表之外，也可以认识同路的人。"
              : "没有找到这门课。"
          }
          action={
            scope === "enrolled" ? (
              <button
                className="sw-button sw-soft"
                onClick={() => setScope("popular")}
              >
                查找我的课程
              </button>
            ) : undefined
          }
        >
          {scope === "enrolled"
            ? "先添加你正在修读的课程，SideSeat 会记住你的校园日常。"
            : "换个关键词试试，或手动添加尚未收录的课程。"}
        </Empty>
      )}
      {data.data?.nextCursor ? (
        <p className="sw-muted">结果较多，请输入更具体的课程名称或编号。</p>
      ) : null}
      {manual ? (
        <Modal title="添加正在修读的课程" onClose={() => setManual(false)}>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              setBusy("manual");
              setError("");
              try {
                await webRequest("/api/v1/courses/manual", "POST", {
                  name: form.get("name"),
                  ...(form.get("code") ? { code: form.get("code") } : {}),
                });
                setManual(false);
                setScope("enrolled");
                data.reload();
                refreshWebData();
              } catch (cause) {
                setError(messageOf(cause));
              } finally {
                setBusy(null);
              }
            }}
          >
            <Field label="课程名称">
              <input name="name" minLength={2} maxLength={120} required />
            </Field>
            <Field label="课程编号（选填）">
              <input name="code" maxLength={40} />
            </Field>
            <p className="sw-muted">
              课程会添加到你的当前学校与学期。手动添加需要完成学生认证。
            </p>
            <ErrorNotice message={error} />
            <div className="sw-form-actions">
              <button
                className="sw-button sw-primary"
                disabled={busy === "manual"}
              >
                添加并加入
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
      {remove ? (
        <Modal title="退出这门课程？" onClose={() => setRemove(null)}>
          <p className="sw-muted">
            {remove.name} 将从当前修读课程中移除，相应课程安排也会更新。
          </p>
          <ErrorNotice message={error} />
          <div className="sw-form-actions">
            <button className="sw-button" onClick={() => setRemove(null)}>
              保留
            </button>
            <button
              className="sw-button sw-danger"
              disabled={!!busy}
              onClick={() => void enrollment(remove)}
            >
              确认退出
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
function LanguageEditor({
  profile,
  close,
  saved,
}: {
  profile: Profile;
  close: () => void;
  saved: () => void;
}) {
  const [rows, setRows] = useState(profile.languages),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="你愿意用哪些语言交流？" onClose={close}>
      <p className="sw-muted" style={{ marginBottom: 20 }}>
        语言会帮助你遇到聊得来的同行，也会同步到手机端。
      </p>
      {LANGUAGE_TAG_OPTIONS.map((option) => {
        const selected = rows.find((row) => row.tag === option.value);
        return (
          <div className="sw-language-row" key={option.value}>
            <label className="sw-check">
              <input
                type="checkbox"
                checked={!!selected}
                onChange={(event) =>
                  setRows((value) =>
                    event.target.checked
                      ? [
                          ...value,
                          { tag: option.value, proficiency: "CONVERSATIONAL" },
                        ]
                      : value.filter((row) => row.tag !== option.value),
                  )
                }
              />
              {option.label}
            </label>
            {selected ? (
              <select
                aria-label={`${option.label} 熟练程度`}
                value={selected.proficiency}
                onChange={(event) =>
                  setRows((value) =>
                    value.map((row) =>
                      row.tag === option.value
                        ? { ...row, proficiency: event.target.value }
                        : row,
                    ),
                  )
                }
              >
                {LANGUAGE_PROFICIENCY_OPTIONS.map((level) => (
                  <option value={level.value} key={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        );
      })}
      <ErrorNotice message={error} />
      <div className="sw-form-actions">
        <button className="sw-button" onClick={close}>
          取消
        </button>
        <button
          className="sw-button sw-primary"
          disabled={busy || !rows.length}
          onClick={async () => {
            setBusy(true);
            try {
              await webRequest("/api/v1/me/languages", "PUT", {
                languages: rows,
              });
              saved();
              refreshWebData();
              close();
            } catch (cause) {
              setError(messageOf(cause));
            } finally {
              setBusy(false);
            }
          }}
        >
          保存语言
        </button>
      </div>
    </Modal>
  );
}
function Privacy({ profile, saved }: { profile: Profile; saved: () => void }) {
  const blocks = useWebResource<{
    blocks: {
      blockedId: string;
      nickname: string | null;
      username: string;
      avatarUrl: string | null;
    }[];
  }>("/api/v1/me/blocks", 0);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function toggle(key: string, value: boolean) {
    setBusy(true);
    try {
      await webRequest("/api/v1/me/profile", "PATCH", { [key]: value });
      saved();
      refreshWebData();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h2 className="sw-section-title">你的边界，由你决定。</h2>
      <p className="sw-muted">
        这些设置与手机端共用，修改后会影响你在 SideSeat 中的可见性。
      </p>
      {[
        [
          "hideFromDiscovery",
          "在发现中隐藏我",
          "开启后，同学无法在发现和推荐中找到你。",
        ],
        [
          "hideFromCourseMembers",
          "在课程成员中隐藏我",
          "保留你的课程和课表，隐藏课程成员列表中的资料。",
        ],
        [
          "contactInfoOptIn",
          "允许展示我填写的联系方式",
          "只有符合现有权限规则的人可以看到。",
        ],
      ].map(([key, title, detail]) => (
        <label className="sw-privacy-row" key={key}>
          <span>
            <strong>{title}</strong>
            <small>{detail}</small>
          </span>
          <input
            type="checkbox"
            className="sw-toggle"
            checked={profile.privacy[key as keyof Profile["privacy"]]}
            disabled={busy}
            onChange={(event) => void toggle(key, event.target.checked)}
          />
        </label>
      ))}
      <ErrorNotice message={error} />
      <div className="sw-line" />
      <h3 className="sw-section-title">已屏蔽的同学</h3>
      <ErrorNotice message={blocks.error} />
      {blocks.data?.blocks.length ? (
        blocks.data.blocks.map((person) => (
          <div
            className="sw-row"
            style={{ marginBottom: 15 }}
            key={person.blockedId}
          >
            <Avatar
              name={person.nickname || person.username}
              url={person.avatarUrl}
            />
            <strong className="sw-grow">
              {person.nickname || person.username}
            </strong>
            <button
              className="sw-button sw-small"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await webRequest(
                    `/api/v1/me/blocks/${person.blockedId}`,
                    "DELETE",
                  );
                  blocks.reload();
                } catch (cause) {
                  setError(messageOf(cause));
                } finally {
                  setBusy(false);
                }
              }}
            >
              解除屏蔽
            </button>
          </div>
        ))
      ) : (
        <p className="sw-muted">你还没有屏蔽任何人。</p>
      )}
    </>
  );
}
function Account() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState(false);
  const membership = useWebResource<{
    tier: string;
    plusExpiresAt: string | null;
  }>("/api/v1/me/membership", 0);
  return (
    <>
      <h2 className="sw-section-title">账号与安全</h2>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const form = new FormData(formElement);
          setBusy(true);
          setError("");
          try {
            await webRequest("/api/profile/password", "PATCH", {
              currentPassword: form.get("currentPassword"),
              password: form.get("password"),
              confirmPassword: form.get("confirmPassword"),
            });
            setSuccess(true);
            formElement.reset();
          } catch (cause) {
            setError(messageOf(cause));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="当前密码">
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <div className="sw-form-row">
          <Field label="新密码">
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </Field>
          <Field label="再次输入新密码">
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </Field>
        </div>
        <button className="sw-button sw-soft" disabled={busy}>
          <LockKeyhole size={14} />
          更新密码
        </button>
      </form>
      <ErrorNotice message={error} />
      {success ? <p className="sw-save-status">密码已更新。</p> : null}
      <div className="sw-line" />
      <h3 className="sw-section-title">
        SideSeat {membership.data?.tier === "PLUS" ? "Plus" : "会员"}
      </h3>
      <p className="sw-muted">
        {membership.data?.tier === "PLUS"
          ? `Plus 有效期至 ${new Date(membership.data.plusExpiresAt!).toLocaleDateString("zh-CN")}`
          : "如果你有邀请码，可以在这里兑换，权益与手机端共用。"}
      </p>
      <form
        className="sw-course-search"
        style={{ marginTop: 15 }}
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setBusy(true);
          try {
            await webRequest("/api/v1/me/membership/redeem", "POST", {
              code: form.get("code"),
            });
            membership.reload();
          } catch (cause) {
            setError(messageOf(cause));
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          className="sw-search"
          name="code"
          aria-label="会员邀请码"
          required
          placeholder="输入邀请码"
        />
        <button className="sw-button sw-soft" disabled={busy}>
          兑换
        </button>
      </form>
    </>
  );
}
function Feedback() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  return (
    <>
      <h2 className="sw-section-title">让下一次体验，更好一点。</h2>
      <p className="sw-muted" style={{ marginBottom: 22 }}>
        遇到了问题，或有一个新想法？我们想听听。
      </p>
      {done ? (
        <div className="sw-banner">
          <Check size={20} />
          反馈已提交，感谢你帮助 SideSeat 变得更好。
        </div>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setBusy(true);
            setError("");
            try {
              await webRequest("/api/v1/feedback", "POST", {
                topic: form.get("topic"),
                title: form.get("title"),
                message: form.get("message"),
              });
              setDone(true);
            } catch (cause) {
              setError(messageOf(cause));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="反馈类型">
            <select name="topic">
              <option value="idea">有个新想法</option>
              <option value="bug">遇到了问题</option>
              <option value="other">其他</option>
            </select>
          </Field>
          <Field label="用一句话概括">
            <input name="title" minLength={3} maxLength={120} required />
          </Field>
          <Field label="再详细说说">
            <textarea name="message" minLength={10} maxLength={4000} required />
          </Field>
          <ErrorNotice message={error} />
          <button className="sw-button sw-primary" disabled={busy}>
            提交反馈
            <ArrowRight size={15} />
          </button>
        </form>
      )}
    </>
  );
}
function ProfileForm({
  profile,
  saved,
}: {
  profile: Profile;
  saved: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [languages, setLanguages] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  async function upload(selected: File) {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", selected);
      const response = await apiFetch("/api/v1/me/avatar", {
        method: "POST",
        headers: {
          "Idempotency-Key": crypto.randomUUID(),
          "Accept-Language": "zh-CN",
        },
        body: form,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error?.message ?? "头像上传失败。");
      saved();
      router.refresh();
      setNotice("头像已更新。");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="sw-profile-intro">
        <Avatar
          name={profile.displayName}
          url={profile.avatarUrl}
          size="large"
        />
        <div>
          <h2>{profile.displayName}</h2>
          <p>@{profile.username}</p>
        </div>
        <button
          className="sw-button sw-small"
          disabled={busy}
          onClick={() => file.current?.click()}
        >
          <ImagePlus size={14} />
          更换头像
        </button>
        <input
          ref={file}
          type="file"
          hidden
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            if (event.target.files?.[0]) void upload(event.target.files[0]);
            event.target.value = "";
          }}
        />
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setBusy(true);
          setError("");
          try {
            await webRequest("/api/v1/me/profile", "PATCH", {
              nickname: form.get("nickname"),
              bio: form.get("bio"),
              major: form.get("major"),
              semester: Number(form.get("semester")),
              degreeLevel: form.get("degree"),
              wechatHandle: form.get("wechat"),
              whatsappHandle: form.get("whatsapp"),
              telegramHandle: form.get("telegram"),
              instagramHandle: form.get("instagram"),
            });
            saved();
            router.refresh();
            refreshWebData();
            setNotice("资料已保存，手机端也会更新。");
          } catch (cause) {
            setError(messageOf(cause));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="sw-form-row">
          <Field label="大家怎么称呼你？">
            <input
              name="nickname"
              defaultValue={profile.nickname ?? ""}
              minLength={2}
              maxLength={32}
              required
            />
          </Field>
          <Field label="学校">
            <input value={profile.school ?? ""} readOnly />
          </Field>
        </div>
        <Field label="一句话介绍自己">
          <textarea
            name="bio"
            defaultValue={profile.tagline ?? ""}
            maxLength={120}
            placeholder="最近在忙什么？有什么想一起做的事？"
          />
        </Field>
        <div className="sw-form-row">
          <Field label="专业">
            <input
              name="major"
              defaultValue={profile.major ?? ""}
              maxLength={160}
            />
          </Field>
          <Field label="学位">
            <select
              name="degree"
              defaultValue={profile.degreeLevel ?? "BACHELOR"}
            >
              <option value="BACHELOR">本科</option>
              <option value="MASTER">硕士</option>
              <option value="OTHER">其他</option>
            </select>
          </Field>
        </div>
        <Field label="学期">
          <input
            name="semester"
            type="number"
            min={1}
            max={20}
            defaultValue={profile.semester ?? 1}
          />
        </Field>
        <div className="sw-line" />
        <button
          className="sw-setting-link"
          type="button"
          onClick={() => setLanguages(true)}
        >
          <Languages size={19} />
          <div>
            <strong>交流语言</strong>
            <small>
              {profile.languages
                .map(
                  (row) =>
                    LANGUAGE_TAG_OPTIONS.find(
                      (option) => option.value === row.tag,
                    )?.label ?? row.tag,
                )
                .join(" · ") || "添加语言，让聊天更自然"}
            </small>
          </div>
          <ChevronRight size={17} />
        </button>
        <details style={{ marginTop: 18 }}>
          <summary className="sw-muted">
            联系方式（是否展示由隐私设置决定）
          </summary>
          <div className="sw-form-row" style={{ marginTop: 15 }}>
            {[
              ["wechat", "微信", profile.contacts.wechatHandle],
              ["whatsapp", "WhatsApp", profile.contacts.whatsappHandle],
              ["telegram", "Telegram", profile.contacts.telegramHandle],
              ["instagram", "Instagram", profile.contacts.instagramHandle],
            ].map(([name, label, value]) => (
              <Field key={name} label={label!}>
                <input name={name!} defaultValue={value ?? ""} maxLength={80} />
              </Field>
            ))}
          </div>
        </details>
        <ErrorNotice message={error} />
        {notice ? (
          <p className="sw-save-status" role="status">
            {notice}
          </p>
        ) : null}
        <div className="sw-form-actions">
          <button className="sw-button sw-primary" disabled={busy}>
            {busy ? "保存中…" : "保存资料"}
            <Check size={15} />
          </button>
        </div>
      </form>
      {languages ? (
        <LanguageEditor
          profile={profile}
          close={() => setLanguages(false)}
          saved={saved}
        />
      ) : null}
    </>
  );
}
export function MePage() {
  const profile = useWebResource<Profile>("/api/v1/me");
  const [tab, setTab] = useState("profile");
  const sections = [
    { key: "profile", name: "个人资料", icon: UserRound },
    { key: "courses", name: "我的课程", icon: BookOpen },
    { key: "verification", name: "学生认证", icon: GraduationCap },
    { key: "privacy", name: "隐私与屏蔽", icon: ShieldCheck },
    { key: "account", name: "账号与会员", icon: LockKeyhole },
    { key: "feedback", name: "帮助与反馈", icon: MessageSquare },
  ];
  return (
    <>
      <PageHeading
        eyebrow="A LITTLE MORE YOU"
        title="在这里，做舒服的自己。"
        description="你的资料、课程与偏好，手机和网页共用。"
      />
      <ErrorNotice message={profile.error} retry={profile.reload} />
      {profile.loading ? (
        <Loading />
      ) : profile.data ? (
        <div className="sw-profile-layout">
          <aside className="sw-profile-sidebar">
            <div className="sw-profile-summary">
              <Avatar
                name={profile.data.displayName}
                url={profile.data.avatarUrl}
                size="large"
              />
              <h2>{profile.data.displayName}</h2>
              <p>
                {profile.data.school} · {profile.data.major || "校园同学"}
              </p>
              <span
                className={`sw-label ${profile.data.verifiedStudent ? "" : "gray"}`}
              >
                <ShieldCheck size={11} />
                {profile.data.verifiedStudent ? "已认证学生" : "待完成学生认证"}
              </span>
            </div>
            <nav aria-label="个人设置">
              {sections.map((section) => (
                <button
                  className={tab === section.key ? "is-active" : ""}
                  key={section.key}
                  onClick={() => setTab(section.key)}
                >
                  <section.icon size={17} />
                  {section.name}
                  <ChevronRight size={13} />
                </button>
              ))}
            </nav>
            <div className="sw-aside-note">
              <Sparkles size={25} />
              <p>
                最好的自我介绍，
                <br />
                是你真心想一起做的事。
              </p>
            </div>
          </aside>
          <section className="sw-panel sw-profile-content">
            {tab === "profile" ? (
              <ProfileForm
                key={profile.data.id}
                profile={profile.data}
                saved={profile.reload}
              />
            ) : tab === "courses" ? (
              <Courses />
            ) : tab === "verification" ? (
              <>
                <h2 className="sw-section-title">
                  从共同的校园，安心认识彼此。
                </h2>
                <p className="sw-muted" style={{ marginBottom: 25 }}>
                  认证结果和手机端共用，认证后可以发现更多同校的共同意愿。
                </p>
                <LocaleProvider initialLocale="zh-CN">
                  <StudentVerificationForm
                    currentStatus={profile.data.studentVerificationStatus}
                    email={profile.data.email}
                    schoolCode={profile.data.school as "TUM"}
                    schoolShortLabel={profile.data.school}
                  />
                </LocaleProvider>
              </>
            ) : tab === "privacy" ? (
              <Privacy profile={profile.data} saved={profile.reload} />
            ) : tab === "account" ? (
              <Account />
            ) : (
              <Feedback />
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
