"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

type Batch = { id: string; label: string; mode: string; durationDays: number; expiresAt: string; disabledAt: string | null; createdByName: string; codeCount: number; totalUses: number; redeemedCount: number; remaining: number };
type BatchList = { batches: Batch[]; total: number; page: number; pageSize: number };
type Entry = { id: string; codeId?: string | null; maxRedemptions?: number; redeemedCount?: number; disabledAt?: string | null; expiresAt?: string; createdAt?: string; plusExpiresAt?: string; user?: { username: string }; actorName?: string; action?: string };
type Detail = { batch: { id: string; label: string; disabledAt: string | null; expiresAt: string }; view: View; entries: Entry[]; total: number; page: number; pageSize: number };
type View = "codes" | "redemptions" | "audit";
type Created = { batchId: string; codes: Array<{ id: string; code: string }>; alreadyCreated: boolean };
const inputStyle = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600";
const buttonStyle = "rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryStyle = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-40";
const date = (value: string) => new Date(value).toLocaleString("zh-CN");
const labels = { codes: "邀请码", redemptions: "兑换记录", audit: "操作记录" };
const actions: Record<string, string> = { CREATE_BATCH: "创建批次", DISABLE_BATCH: "停用整批", DISABLE_CODE: "停用单个码" };

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/admin/membership-invites${path}`, { ...options, cache: "no-store", headers: { "Content-Type": "application/json" } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "操作失败，请重试。");
  return payload.data as T;
}

export function MembershipInviteAdmin({ username }: { username: string }) {
  const [list, setList] = useState<BatchList>();
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [view, setView] = useState<View>("codes");
  const [detailPage, setDetailPage] = useState(1);
  const [detail, setDetail] = useState<Detail>();
  const [issue, setIssue] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created>();
  const [mode, setMode] = useState("SHARED");
  const [copied, setCopied] = useState(false);
  const requestKey = useRef<string | null>(null);
  const [pendingDisable, setPendingDisable] = useState<{ batchId: string; codeId?: string }>();
  const [expires, setExpires] = useState("");

  useEffect(() => {
    const next = new Date(Date.now() + 30 * 86_400_000);
    next.setMinutes(next.getMinutes() - next.getTimezoneOffset());
    setExpires(next.toISOString().slice(0, 16));
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setList(undefined);
    api<BatchList>(`?page=${page}`, { signal: controller.signal }).then(setList).catch(error => { if (!controller.signal.aborted) setIssue(error.message); });
    return () => controller.abort();
  }, [page, reload]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setDetail(undefined);
    api<Detail>(`/${selected}?view=${view}&page=${detailPage}`, { signal: controller.signal }).then(setDetail).catch(error => { if (!controller.signal.aborted) setIssue(error.message); });
    return () => controller.abort();
  }, [selected, view, detailPage, reload]);

  const refresh = useCallback(() => setReload(value => value + 1), []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setIssue(""); setCopied(false);
    const form = new FormData(event.currentTarget);
    requestKey.current ??= crypto.randomUUID();
    try {
      const result = await api<Created>("", { method: "POST", body: JSON.stringify({ requestKey: requestKey.current,
        label: form.get("label"), mode, quantity: Number(form.get("quantity")), durationDays: Number(form.get("days")), expiresAt: new Date(expires).toISOString(),
      }) });
      setCreated(result); requestKey.current = null;
      setSelected(result.batchId); setView("codes"); setDetailPage(1); setPage(1); refresh();
    } catch (error) { setIssue(error instanceof Error ? error.message : "创建失败，请重试。"); }
    finally { setBusy(false); }
  }
  async function disable() {
    if (!pendingDisable) return;
    setBusy(true); setIssue("");
    try {
      await api(`/${pendingDisable.batchId}`, { method: "PATCH", body: JSON.stringify({ action: "DISABLE", codeId: pendingDisable.codeId }) });
      setPendingDisable(undefined); refresh();
    } catch (error) { setIssue(error instanceof Error ? error.message : "停用失败，请重试。"); }
    finally { setBusy(false); }
  }
  function download() {
    if (!created) return;
    const csv = "code_id,invitation_code\n" + created.codes.map(row => `${row.id},${row.code}`).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `sideseat-invites-${created.batchId}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  function selectBatch(id: string) { setSelected(id); setView("codes"); setDetailPage(1); }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-semibold tracking-widest text-teal-700">SIDESEAT · 管理后台</p><h1 className="mt-2 text-3xl font-semibold">邀请码管理</h1><p className="mt-2 text-sm text-slate-500">创建会员邀请，查看领取情况，控制发放范围。</p></div>
          <div className="text-sm"><p>管理员 @{username}</p><Link className="mt-2 inline-block text-teal-700 underline" href="/admin/users">用户管理</Link></div>
        </header>

        {issue && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{issue}<button className="ml-4 underline" onClick={() => { setIssue(""); refresh(); }}>重新加载</button></div>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="create-title">
          <h2 id="create-title" className="text-lg font-semibold">创建发放批次</h2>
          <form className="mt-4 space-y-4" onSubmit={create} onChange={() => { if (!busy) requestKey.current = null; }}>
            <fieldset disabled={busy || Boolean(created?.codes.length)} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 disabled:opacity-60">
              <label className="text-sm font-medium">批次名称<input className={inputStyle} name="label" required maxLength={80} placeholder="例如：首批校园内测" /></label>
              <label className="text-sm font-medium">发码方式<select className={inputStyle} value={mode} onChange={event => setMode(event.target.value)}><option value="SHARED">共享码</option><option value="INDIVIDUAL">独立码</option></select></label>
              <label className="text-sm font-medium">{mode === "SHARED" ? "可兑换人数" : "生成数量"}<input className={inputStyle} name="quantity" type="number" min={1} max={500} defaultValue={100} required /></label>
              <label className="text-sm font-medium">赠送 Plus 天数<input className={inputStyle} name="days" type="number" min={1} max={3650} defaultValue={30} required /></label>
              <label className="text-sm font-medium">兑换截止时间<input className={inputStyle} type="datetime-local" value={expires} onChange={event => setExpires(event.target.value)} required /></label>
            </fieldset>
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">{mode === "SHARED" ? "一个码多人使用，每个账号限领一次。" : "每人一个独立码，每码限用一次。"} 截止时间按当前设备时区填写。</p><button className={buttonStyle} disabled={busy || Boolean(created?.codes.length)} type="submit">{busy ? "处理中…" : "创建邀请码"}</button></div>
          </form>
        </section>

        {created && <section className="rounded-2xl border border-teal-200 bg-teal-50 p-5" aria-label="新生成的邀请码">
          <h2 className="font-semibold">{created.alreadyCreated ? "该批次已创建" : `已生成 ${created.codes.length} 个邀请码`}</h2>
          <p className="mt-2 text-sm text-teal-900">邀请码原文仅本次展示，请复制或下载保存。后台记录只保留兑换状态。</p>
          {created.alreadyCreated ? <p className="mt-2 text-sm">本次是重复请求，没有重复发码。如果上次未保存原文，请停用该批次后重新创建。</p> : <>
            <textarea aria-label="邀请码原文" readOnly value={created.codes.map(row => row.code).join("\n")} rows={Math.min(6, created.codes.length + 1)} className="mt-3 w-full rounded-xl border border-teal-200 bg-white p-3 font-mono text-sm" />
            <div className="mt-3 flex flex-wrap gap-2"><button className={secondaryStyle} onClick={async () => { try { await navigator.clipboard.writeText(created.codes.map(row => row.code).join("\n")); setCopied(true); } catch { setIssue("复制失败，请手动选择邀请码或下载 CSV。"); } }}>{copied ? "已复制" : "复制邀请码"}</button><button className={secondaryStyle} onClick={download}>下载 CSV</button><button className={secondaryStyle} onClick={() => setCreated(undefined)}>已保存，关闭</button></div>
          </>}
        </section>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="batches-title">
          <div className="flex items-center justify-between"><h2 id="batches-title" className="text-lg font-semibold">发放批次{list ? ` · ${list.total}` : ""}</h2><button className={secondaryStyle} onClick={refresh}>刷新记录</button></div>
          {!list ? <p role="status" className="py-8 text-sm text-slate-500">正在加载批次…</p> : !list.batches.length ? <p className="py-8 text-sm text-slate-500">还没有发放批次。创建第一个邀请码即可开始。</p> : <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {list.batches.map(batch => <article key={batch.id} className={`rounded-xl border p-4 ${selected === batch.id ? "border-teal-600 bg-teal-50/40" : "border-slate-200"}`}>
              <div className="flex items-start justify-between gap-2"><h3 className="break-all font-semibold">{batch.label}</h3><span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs">{batch.disabledAt ? "已停用" : new Date(batch.expiresAt) <= new Date() ? "已过期" : batch.remaining === 0 ? "已用完" : "可兑换"}</span></div>
              <p className="mt-2 text-sm text-slate-500">{batch.mode === "SHARED" ? "共享码" : `${batch.codeCount} 个独立码`} · Plus {batch.durationDays} 天</p>
              <p className="mt-3 text-sm">已兑换 <strong>{batch.redeemedCount}</strong> / {batch.totalUses} · 可用名额 <strong>{batch.remaining}</strong></p>
              <p className="mt-2 text-xs text-slate-500">截止 {date(batch.expiresAt)} · 创建者 @{batch.createdByName}</p>
              <div className="mt-4 flex gap-2"><button className={secondaryStyle} onClick={() => selectBatch(batch.id)}>查看详情</button><button className={`${secondaryStyle} text-red-700`} disabled={busy || Boolean(batch.disabledAt)} onClick={() => setPendingDisable({ batchId: batch.id })}>停用整批</button></div>
            </article>)}
          </div>}
          {list && <Pagination page={page} total={list.total} size={20} onPage={setPage} />}
        </section>

        {selected && <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" aria-label="批次详情">
          <h2 className="text-lg font-semibold">{detail?.batch.label ?? "批次详情"}</h2>
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="记录类型">{(Object.keys(labels) as View[]).map(tab => <button key={tab} aria-pressed={view === tab} className={view === tab ? buttonStyle : secondaryStyle} onClick={() => { setView(tab); setDetailPage(1); }}>{labels[tab]}</button>)}</div>
          {!detail ? <p role="status" className="py-6">正在加载记录…</p> : <>
            <div className="mt-4 divide-y divide-slate-100">
              {!detail.entries.length && <p className="py-6 text-sm text-slate-500">暂无{labels[view]}。</p>}
              {detail.entries.map(entry => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                {view === "codes" ? <><div><p className="break-all font-mono text-xs">编号 {entry.id}</p><p className="mt-1 text-slate-500">已兑换 {entry.redeemedCount} / {entry.maxRedemptions} · {entry.disabledAt ? "已停用" : new Date(entry.expiresAt!) <= new Date() ? "已过期" : entry.redeemedCount === entry.maxRedemptions ? "已用完" : "可兑换"}</p></div><button className={`${secondaryStyle} text-red-700`} disabled={busy || Boolean(entry.disabledAt)} onClick={() => setPendingDisable({ batchId: selected, codeId: entry.id })}>停用此码</button></> : view === "redemptions" ? <div><p>@{entry.user?.username} · {date(entry.createdAt!)}</p><p className="mt-1 break-all text-xs text-slate-500">码编号 {entry.codeId} · 兑换后有效期至 {date(entry.plusExpiresAt!)}</p></div> : <div><p>@{entry.actorName} · {actions[entry.action!] ?? entry.action} · {date(entry.createdAt!)}</p>{entry.codeId && <p className="mt-1 break-all font-mono text-xs text-slate-500">{entry.codeId}</p>}</div>}
              </div>)}
            </div>
            <Pagination page={detailPage} total={detail.total} size={25} onPage={setDetailPage} />
          </>}
        </section>}

        {pendingDisable && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4"><section role="dialog" aria-modal="true" aria-labelledby="disable-title" className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"><h2 id="disable-title" className="text-lg font-semibold">{pendingDisable.codeId ? "停用这个邀请码？" : "停用整个批次？"}</h2><p className="mt-3 text-sm text-slate-500">后续将无法兑换，已经领取的会员保持有效。停用后不能重新启用。</p><div className="mt-5 flex justify-end gap-3"><button autoFocus disabled={busy} className={secondaryStyle} onClick={() => setPendingDisable(undefined)}>取消</button><button disabled={busy} className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={disable}>确认停用</button></div></section></div>}
      </div>
    </main>
  );
}

function Pagination({ page, total, size, onPage }: { page: number; total: number; size: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages === 1) return null;
  return <div className="mt-4 flex items-center justify-between gap-2 text-sm"><button className={secondaryStyle} disabled={page <= 1} onClick={() => onPage(page - 1)}>上一页</button><span>第 {page} / {pages} 页</span><button className={secondaryStyle} disabled={page >= pages} onClick={() => onPage(page + 1)}>下一页</button></div>;
}
