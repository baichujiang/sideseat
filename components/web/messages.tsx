"use client";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarPlus,
  ChevronDown,
  ImagePlus,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pin,
  Search,
  Send,
  Shield,
} from "lucide-react";
import { apiFetch } from "@/lib/auth/api-fetch";
import { sharedPlanFromMessage } from "@/lib/web/plan-message";
import {
  clock,
  localInput,
  messageOf,
  prettyDate,
  refreshWebData,
  useWebResource,
  webEnvelope,
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
import { useWebUser } from "./web-shell";
import { GreetingModal, type Opportunity } from "./together";
import { DirectPlanModal, type DirectPlan } from "./plans";
type Conversation = {
  id: string;
  kind: string;
  displayName: string;
  avatarUrl: string | null;
  unreadCount: number;
  pinned: boolean;
  lastMessage: {
    body: string | null;
    type: string;
    createdAt: string;
    deletedAt: string | null;
  } | null;
};
type ChatMessage = {
  id: string;
  sender: {
    id: string;
    nickname: string | null;
    username: string;
    avatarUrl: string | null;
  };
  type: string;
  body: string | null;
  imageUrl: string | null;
  deletedAt: string | null;
  createdAt: string;
  planRequest: DirectPlan | null;
  location: {
    latitude: number;
    longitude: number;
    name: string | null;
  } | null;
};
type ChatData = {
  connection: {
    id: string;
    displayName: string;
    peer: {
      id: string;
      nickname: string | null;
      username: string;
      avatarUrl: string | null;
    };
  };
  messages: ChatMessage[];
};
function CreateDirectPlan({
  connectionId,
  close,
  done,
}: {
  connectionId: string;
  close: () => void;
  done: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const start = new Date(Date.now() + 86400000);
  start.setMinutes(0, 0, 0);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await webRequest(`/api/v1/connections/${connectionId}/plans`, "POST", {
        title: form.get("title"),
        location: form.get("location"),
        message: form.get("message"),
        startTime: new Date(String(form.get("start"))).toISOString(),
        endTime: new Date(String(form.get("end"))).toISOString(),
        planType: "CUSTOM",
      });
      done();
      refreshWebData();
      close();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="从聊天，到见面。" onClose={close}>
      <form onSubmit={(event) => void submit(event)}>
        <Field label="一起做什么？">
          <input
            name="title"
            maxLength={120}
            required
            autoFocus
            placeholder="例如：一起复习，下课去吃饭"
          />
        </Field>
        <Field label="在哪里？">
          <input name="location" maxLength={120} />
        </Field>
        <div className="sw-form-row">
          <Field label="开始">
            <input
              name="start"
              type="datetime-local"
              defaultValue={localInput(start)}
              required
            />
          </Field>
          <Field label="结束">
            <input
              name="end"
              type="datetime-local"
              defaultValue={localInput(new Date(start.getTime() + 3600000))}
              required
            />
          </Field>
        </div>
        <Field label="想说的话">
          <textarea name="message" maxLength={500} />
        </Field>
        <p className="sw-muted">
          对方明确接受后，安排才会出现在双方的 SideSeat 日历里。
        </p>
        <ErrorNotice message={error} />
        <div className="sw-form-actions">
          <button className="sw-button" type="button" onClick={close}>
            取消
          </button>
          <button className="sw-button sw-primary" disabled={busy}>
            发送计划邀请
            <Send size={14} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function MessagesPage() {
  const params = useSearchParams();
  const selected = params.get("chat");
  const inbox = useWebResource<{
    conversations: Conversation[];
    messageRequests: Opportunity[];
    plansNeedingYourAction: number;
  }>("/api/v1/inbox", 10000);
  const [query, setQuery] = useState(""),
    [tab, setTab] = useState("chats"),
    [greeting, setGreeting] = useState<Opportunity | null>(null),
    [error] = useState("");
  const conversations = (inbox.data?.conversations ?? []).filter(
    (row) =>
      row.kind === "DIRECT" &&
      row.displayName.toLowerCase().includes(query.toLowerCase()),
  );
  const requests = (inbox.data?.messageRequests ?? []).filter(
    (row) =>
      row.messageRequest?.direction === "INCOMING" &&
      row.messageRequest.status === "PENDING",
  );
  return (
    <>
      <PageHeading
        eyebrow="A CONVERSATION AWAY"
        title="每一声招呼，都可能是个开始。"
        description="和手机端延续同一段对话，也把见面的期待聊成计划。"
      />
      <div className={`sw-messages ${selected ? "has-selection" : ""}`}>
        <aside className="sw-conversation-list">
          <div className="sw-message-list-top">
            <h2>
              你的对话<span>{conversations.length}</span>
            </h2>
            <label className="sw-calendar-search">
              <Search size={15} />
              <input
                aria-label="搜索聊天"
                placeholder="找一段对话…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="sw-tabs">
              <button
                className={tab === "chats" ? "is-active" : ""}
                onClick={() => setTab("chats")}
              >
                聊天
              </button>
              <button
                className={tab === "requests" ? "is-active" : ""}
                onClick={() => setTab("requests")}
              >
                新招呼{requests.length ? <span>{requests.length}</span> : null}
              </button>
            </div>
          </div>
          <ErrorNotice message={error || inbox.error} retry={inbox.reload} />
          {inbox.loading ? (
            <Loading />
          ) : tab === "chats" ? (
            conversations.length ? (
              conversations.map((row) => (
                <Link
                  key={row.id}
                  href={`/web/messages?chat=${row.id}`}
                  className={`sw-conversation ${selected === row.id ? "is-selected" : ""}`}
                >
                  <Avatar name={row.displayName} url={row.avatarUrl} />
                  <div className="sw-grow">
                    <div>
                      <strong>{row.displayName}</strong>
                      <small>
                        {row.lastMessage
                          ? clock(row.lastMessage.createdAt)
                          : ""}
                      </small>
                    </div>
                    <p>
                      {row.pinned ? <Pin size={10} /> : null}
                      {row.lastMessage?.deletedAt
                        ? "消息已撤回"
                        : (row.lastMessage?.body ??
                          (row.lastMessage?.type === "IMAGE"
                            ? "[图片]"
                            : "从一句你好开始"))}
                    </p>
                  </div>
                  {row.unreadCount > 0 ? (
                    <b className="sw-unread">{row.unreadCount}</b>
                  ) : null}
                </Link>
              ))
            ) : (
              <Empty icon={MessageCircle} title="从一句你好开始。">
                去同行页认识同学，对方回复招呼后，对话就会出现在这里。
              </Empty>
            )
          ) : requests.length ? (
            requests.map((row) => (
              <button
                className="sw-conversation"
                key={row.id}
                onClick={() => setGreeting(row)}
              >
                <Avatar name={row.peer.displayName} url={row.peer.avatarUrl} />
                <div className="sw-grow">
                  <strong>{row.peer.displayName}</strong>
                  <p>{row.messageRequest?.body}</p>
                </div>
                <ArrowRight size={15} />
              </button>
            ))
          ) : (
            <Empty icon={MessageCircle} title="暂时没有新招呼。">
              愿下一声你好，来自刚好同路的人。
            </Empty>
          )}
          {inbox.data?.plansNeedingYourAction ? (
            <Link href="/web/plans" className="sw-message-plan-notice">
              <CalendarPlus size={16} />
              {inbox.data.plansNeedingYourAction} 个计划等你回复
              <ArrowRight size={14} />
            </Link>
          ) : null}
        </aside>
        <section className="sw-chat-panel">
          {selected ? (
            <ChatThread
              key={selected}
              connectionId={selected}
              refreshInbox={inbox.reload}
            />
          ) : (
            <div className="sw-chat-placeholder">
              <span className="sw-chat-art">
                <MessageCircle size={70} strokeWidth={1} />
                <span>hello.</span>
              </span>
              <h2>让文字，成为见面的开场白。</h2>
              <p>选一段对话，接着聊吧。</p>
              <Link href="/web/together" className="sw-text-button">
                去找同路的人
                <ArrowRight size={14} />
              </Link>
            </div>
          )}
        </section>
      </div>
      {greeting ? (
        <GreetingModal
          opportunity={greeting}
          close={() => setGreeting(null)}
          onSaved={inbox.reload}
        />
      ) : null}
    </>
  );
}
function ChatThread({
  connectionId,
  refreshInbox,
}: {
  connectionId: string;
  refreshInbox: () => void;
}) {
  const user = useWebUser(),
    router = useRouter();
  const chat = useWebResource<ChatData>(
    `/api/v1/connections/${encodeURIComponent(connectionId)}/messages?limit=50`,
    5000,
  );
  const [text, setText] = useState(""),
    [error, setError] = useState(""),
    [sending, setSending] = useState(false),
    [plan, setPlan] = useState(false),
    [direct, setDirect] = useState<DirectPlan | null>(null),
    [menu, setMenu] = useState(false),
    [blocking, setBlocking] = useState(false),
    [remark, setRemark] = useState(false),
    [earlier, setEarlier] = useState<ChatMessage[]>([]),
    [olderAvailable, setOlderAvailable] = useState(true),
    [loadingEarlier, setLoadingEarlier] = useState(false);
  const scroll = useRef<HTMLDivElement>(null),
    file = useRef<HTMLInputElement>(null),
    lastID = useRef<string | null>(null);
  const data = chat.data;
  const messages = [...earlier, ...(data?.messages ?? [])].filter(
    (row, index, rows) =>
      rows.findIndex((item) => item.id === row.id) === index,
  );
  useEffect(() => {
    const id = data?.messages.at(-1)?.id;
    if (!id || id === lastID.current) return;
    lastID.current = id;
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
    if (document.visibilityState === "visible")
      void webRequest(`/api/v1/connections/${connectionId}/read`, "POST")
        .then(() => refreshInbox())
        .catch((cause) => setError(messageOf(cause)));
  }, [data?.messages, connectionId, refreshInbox]);
  async function send(body: unknown) {
    setSending(true);
    setError("");
    try {
      await webRequest(
        `/api/v1/connections/${connectionId}/messages`,
        "POST",
        body,
      );
      setText("");
      chat.reload();
      refreshWebData();
      return true;
    } catch (cause) {
      setError(messageOf(cause));
      return false;
    } finally {
      setSending(false);
    }
  }
  async function image(selected: File) {
    setSending(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", selected);
      const response = await apiFetch(
        `/api/connections/${connectionId}/chat-images`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: form,
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          typeof payload.error === "string" ? payload.error : "图片上传失败。",
        );
      await send({ type: "IMAGE", imageUrl: payload.data.url });
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSending(false);
    }
  }
  return (
    <>
      <header className="sw-chat-header">
        <Link
          href="/web/messages"
          className="sw-chat-back sw-icon-button"
          aria-label="返回聊天列表"
        >
          <ArrowLeft size={19} />
        </Link>
        {data ? (
          <>
            <Avatar
              name={data.connection.displayName}
              url={data.connection.peer.avatarUrl}
            />
            <div className="sw-grow">
              <h2>{data.connection.displayName}</h2>
              <p>和手机端延续同一段对话</p>
            </div>
          </>
        ) : (
          <div className="sw-grow" />
        )}
        <button
          className="sw-icon-button"
          aria-label="发起双人计划"
          onClick={() => setPlan(true)}
        >
          <CalendarPlus size={20} />
        </button>
        <div className="sw-menu-anchor">
          <button
            className="sw-icon-button"
            aria-label="聊天选项"
            onClick={() => setMenu((value) => !value)}
          >
            <MoreHorizontal size={20} />
          </button>
          {menu ? (
            <div className="sw-menu">
              <button
                onClick={async () => {
                  try {
                    await webRequest(
                      `/api/v1/connections/${connectionId}/pin`,
                      "POST",
                    );
                    refreshInbox();
                    setMenu(false);
                  } catch (cause) {
                    setError(messageOf(cause));
                  }
                }}
              >
                <Pin size={14} />
                置顶 / 取消置顶
              </button>
              <button
                onClick={() => {
                  setMenu(false);
                  setRemark(true);
                }}
              >
                编辑联系人备注
              </button>
              <button
                onClick={() => {
                  setMenu(false);
                  setBlocking(true);
                }}
              >
                <Shield size={14} />
                屏蔽对方
              </button>
            </div>
          ) : null}
        </div>
      </header>
      <ErrorNotice message={error || chat.error} retry={chat.reload} />
      <div className="sw-chat-scroll" ref={scroll}>
        {chat.loading && !data ? (
          <Loading />
        ) : !messages.length ? (
          <Empty icon={MessageCircle} title="好久不见，或初次见面。">
            从共同想做的事，接着聊下去。
          </Empty>
        ) : (
          <>
            {olderAvailable && messages.length >= 50 ? (
              <button
                className="sw-load-earlier"
                disabled={loadingEarlier}
                onClick={async () => {
                  setLoadingEarlier(true);
                  try {
                    const result = await webEnvelope<ChatData>(
                      `/api/v1/connections/${connectionId}/messages?limit=50&cursor=${messages[0].id}`,
                    );
                    setEarlier((rows) => [...result.data.messages, ...rows]);
                    setOlderAvailable(!!result.meta?.hasMore);
                  } catch (cause) {
                    setError(messageOf(cause));
                  } finally {
                    setLoadingEarlier(false);
                  }
                }}
              >
                {loadingEarlier ? "加载中…" : "查看更早的消息"}
                <ChevronDown size={12} />
              </button>
            ) : null}
            {messages.map((message, index) => {
              const own = message.sender.id === user.id;
              const newDay =
                index === 0 ||
                new Date(messages[index - 1].createdAt).toDateString() !==
                  new Date(message.createdAt).toDateString();
              return (
                <div key={message.id}>
                  {newDay ? (
                    <div className="sw-chat-day">
                      {prettyDate(message.createdAt)}
                    </div>
                  ) : null}
                  <div className={`sw-chat-message ${own ? "is-own" : ""}`}>
                    {!own ? (
                      <Avatar
                        name={
                          message.sender.nickname || message.sender.username
                        }
                        url={message.sender.avatarUrl}
                        size="small"
                      />
                    ) : null}
                    <div>
                      <div
                        className={`sw-bubble ${message.planRequest ? "sw-plan-bubble" : ""}`}
                      >
                        {message.deletedAt ? (
                          <span className="sw-muted">这条消息已撤回</span>
                        ) : message.planRequest ? (
                          <button
                            className="sw-chat-plan"
                            onClick={() => setDirect(message.planRequest)}
                          >
                            <CalendarPlus size={25} />
                            <strong>{message.planRequest.title}</strong>
                            <span>
                              {prettyDate(message.planRequest.startTime)}{" "}
                              {clock(message.planRequest.startTime)}
                            </span>
                            <small>
                              查看计划与回复
                              <ArrowRight size={12} />
                            </small>
                          </button>
                        ) : message.imageUrl ? (
                          <a
                            href={message.imageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Image
                              unoptimized
                              width={300}
                              height={240}
                              className="sw-chat-image"
                              src={message.imageUrl}
                              alt="聊天图片"
                              style={{ width: "auto", height: "auto" }}
                            />
                          </a>
                        ) : message.location ? (
                          <a
                            href={`https://www.google.com/maps?q=${message.location.latitude},${message.location.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <MapPin size={16} />
                            {message.location.name || "查看位置"}
                          </a>
                        ) : (
                          <ChatText body={message.body} type={message.type} />
                        )}
                      </div>
                      <small className="sw-message-time">
                        {clock(message.createdAt)}
                      </small>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
      <form
        className="sw-chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) void send({ type: "TEXT", body: text.trim() });
        }}
      >
        <div className="sw-chat-tools">
          <button
            className="sw-icon-button"
            type="button"
            aria-label="发送图片"
            disabled={sending}
            onClick={() => file.current?.click()}
          >
            <ImagePlus size={19} />
          </button>
          <button
            className="sw-text-button"
            type="button"
            onClick={() => setPlan(true)}
          >
            <CalendarPlus size={17} />
            约个时间
          </button>
          <input
            ref={file}
            hidden
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              if (event.target.files?.[0]) void image(event.target.files[0]);
              event.target.value = "";
            }}
          />
        </div>
        <textarea
          aria-label="聊天消息"
          placeholder="从一句话开始…"
          value={text}
          maxLength={500}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              if (text.trim() && !sending)
                void send({ type: "TEXT", body: text.trim() });
            }
          }}
        />
        <div className="sw-chat-compose-bottom">
          <small>Enter 发送 · Shift + Enter 换行</small>
          <button
            className="sw-button sw-primary sw-small"
            disabled={sending || !text.trim()}
          >
            发送
            <Send size={13} />
          </button>
        </div>
      </form>
      {plan ? (
        <CreateDirectPlan
          connectionId={connectionId}
          close={() => setPlan(false)}
          done={chat.reload}
        />
      ) : null}
      {direct ? (
        <DirectPlanModal
          plan={direct}
          close={() => setDirect(null)}
          changed={chat.reload}
        />
      ) : null}
      {remark ? (
        <Modal title="联系人备注" onClose={() => setRemark(false)}>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              try {
                await webRequest(
                  `/api/v1/connections/${connectionId}/contact-remark`,
                  "PATCH",
                  { remark: String(form.get("remark")).trim() || null },
                );
                chat.reload();
                refreshInbox();
                setRemark(false);
              } catch (cause) {
                setError(messageOf(cause));
              }
            }}
          >
            <Field label="备注（只对你可见，留空则清除）">
              <input
                name="remark"
                maxLength={60}
                placeholder="如何称呼这位朋友？"
              />
            </Field>
            <button className="sw-button sw-primary">保存备注</button>
          </form>
        </Modal>
      ) : null}
      {blocking ? (
        <Modal title="屏蔽这位同学？" onClose={() => setBlocking(false)}>
          <p className="sw-muted">
            屏蔽后，双方将无法继续互动。你可以在隐私设置中管理屏蔽名单。
          </p>
          <ErrorNotice message={error} />
          <div className="sw-form-actions">
            <button className="sw-button" onClick={() => setBlocking(false)}>
              取消
            </button>
            <button
              className="sw-button sw-danger"
              onClick={async () => {
                try {
                  await webRequest(
                    `/api/v1/connections/${connectionId}/block`,
                    "POST",
                    {},
                  );
                  refreshInbox();
                  router.replace("/web/messages");
                } catch (cause) {
                  setError(messageOf(cause));
                }
              }}
            >
              确认屏蔽
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
function ChatText({ body, type }: { body: string | null; type: string }) {
  const shared = sharedPlanFromMessage(
    body,
    typeof window === "undefined" ? "" : window.location.host,
  );
  return shared ? (
    <Link className="sw-chat-plan" href={`/web/plans/${shared.token}`}>
      <CalendarPlus size={25} />
      <strong>{shared.title}</strong>
      <small>
        打开同一个计划
        <ArrowRight size={12} />
      </small>
    </Link>
  ) : (
    <p>{body || `[${type === "SYSTEM" ? "系统消息" : "计划相关消息"}]`}</p>
  );
}
