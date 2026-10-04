"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarPlus, Check, ChevronRight, Clock3, Copy, MapPin, MessageCircle, Send, X } from "lucide-react";
import type { SharedConversation, SharedIntention, SharedPlan } from "@/lib/intent-share/service";
import { shareCopy, type ShareLocale } from "@/lib/intent-share/copy";
import { isShareLocale, SHARE_LOCALE_COOKIE } from "@/lib/intent-share/locale";
import { useUsernameAvailability } from "@/lib/auth/use-username-availability";
import styles from "./share.module.css";
type Conversation = SharedConversation & { isGuest: boolean; username: string | null; intention?: SharedIntention | null };
async function api(url: string, body?: object, key?: string) {
  const response = await fetch(url, { method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
    ...(body ? { headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, body: JSON.stringify(body) } : {}) });
  const payload = await response.json();
  if (!response.ok) throw Object.assign(new Error(payload.error?.message || payload.error || "Please try again."), { status: response.status, field: payload.error?.field });
  return payload.data;
}
export function IntentShareClient({ token, intention: initialIntention, locale: initialLocale }: { token: string; intention: SharedIntention; locale: ShareLocale }) {
  const [value, setIntention] = useState(initialIntention);
  const [locale, setLocale] = useState(initialLocale), t = shareCopy[locale];
  const [conversation, setConversation] = useState<Conversation>({ state: 'NEW', isGuest: true, username: null, messages: [] });
  const [opened, setOpened] = useState(false), [busy, setBusy] = useState(false), [body, setBody] = useState('');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [selected, setSelected] = useState<string | null>(null);
  const [modal, setModal] = useState<'register'|'complete'|null>(null), [afterRegister, setAfterRegister] = useState<SharedPlan|null>(null);
  const [syncing, setSyncing] = useState(false), [unavailable, setUnavailable] = useState(false), [unread, setUnread] = useState(false);
  const [username, setUsername] = useState(''), [password, setPassword] = useState('');
  const usernameCheck = useUsernameAvailability(username, modal === 'register', t.usernameRules);
  const usernameMessage = usernameCheck.status === 'checking' ? t.usernameChecking : usernameCheck.status === 'available' ? t.usernameAvailable : usernameCheck.status === 'taken' ? t.usernameTaken : usernameCheck.status === 'failed' ? t.usernameCheckFailed : usernameCheck.status === 'invalid' ? usernameCheck.issue : '';
  const installURL = process.env.NEXT_PUBLIC_IOS_INSTALL_URL?.trim();
  const dialog = useRef<HTMLDialogElement>(null), chat = useRef<HTMLElement>(null);
  const messages = useRef<HTMLDivElement>(null), followLatest = useRef(true), revision = useRef(0);
  const planKeys = useRef(new Map<string, string>());
  const messageKey = useRef<{body:string;key:string}|null>(null);
  const url = `/api/public/intent-share/${token}`;
  function recipientURL() {
    const link = new URL(window.location.href);
    link.searchParams.delete('lang');
    return link.href;
  }
  function changeLanguage(next: string) {
    if (!isShareLocale(next)) return;
    setLocale(next);
    document.cookie = `${SHARE_LOCALE_COOKIE}=${next}; Path=/share/intent; Max-Age=31536000; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
    window.history.replaceState(window.history.state, '', recipientURL());
  }
  const refresh = useCallback(async () => {
    const current = ++revision.current;
    const data = await api(url) as Conversation;
    if (current === revision.current) { if (data.intention) setIntention(data.intention); setConversation(data); if (data.messages.length) setOpened(true); }
    return data;
  }, [url]);
  const syncError = useCallback((cause: unknown) => {
    if ((cause as { status?: number })?.status === 404) { setUnavailable(true); setError(t.unavailable); }
    else setError(t.error);
  }, [t.error, t.unavailable]);
  useEffect(() => { refresh().catch(syncError); }, [refresh, syncError]);
  useEffect(() => {
    if (!opened || unavailable) return;
    let stream: EventSource | null = null, timer: ReturnType<typeof setTimeout> | undefined, disposed = false;
    const stop = () => { stream?.close(); stream = null; clearTimeout(timer); };
    const fallback = async () => {
      try { await refresh(); } catch (cause) { if (!disposed) syncError(cause); }
      if (!disposed && document.visibilityState === 'visible') timer = setTimeout(fallback, 2000);
    };
    const connect = () => {
      stop();
      if (disposed || document.visibilityState !== 'visible') return;
      setSyncing(true);
      void refresh().catch(cause => { if (!disposed) syncError(cause); });
      if (typeof EventSource === 'undefined') { void fallback(); return; }
      stream = new EventSource(`${url}/events`);
      stream.addEventListener('conversation', event => {
        if (disposed) return;
        const snapshot = JSON.parse((event as MessageEvent).data) as SharedConversation;
        ++revision.current; // An older HTTP response must not overwrite a newer streamed message.
        setConversation(previous => ({ ...previous, ...snapshot }));
        setSyncing(false); clearTimeout(timer);
      });
      stream.addEventListener('unavailable', () => { stop(); setUnavailable(true); setSyncing(false); setError(t.unavailable); });
      const reconnecting = () => { setSyncing(true); clearTimeout(timer); timer = setTimeout(fallback, 2000); };
      stream.addEventListener('reconnect', reconnecting);
      stream.onerror = reconnecting;
    };
    connect();
    document.addEventListener('visibilitychange', connect);
    window.addEventListener('online', connect);
    window.addEventListener('pageshow', connect);
    return () => {
      disposed = true; stop();
      document.removeEventListener('visibilitychange', connect);
      window.removeEventListener('online', connect);
      window.removeEventListener('pageshow', connect);
    };
  }, [opened, unavailable, conversation.isGuest, refresh, syncError, url, t.unavailable]);
  const lastMessageId = conversation.messages.at(-1)?.id;
  useEffect(() => {
    if (followLatest.current && messages.current) { messages.current.scrollTop = messages.current.scrollHeight; setUnread(false); }
    else if (lastMessageId) setUnread(true);
  }, [lastMessageId]);
  useEffect(() => {
    if (modal) {
      dialog.current?.showModal();
      if (modal === 'complete') dialog.current?.querySelector<HTMLElement>('h2')?.focus();
    } else dialog.current?.close();
  }, [modal]);
  const windows = value.timeWindows.filter(w => new Date(w.endAt).getTime() > Date.now());
  const date = (raw: string) => new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric', timeZone: value.timeZone }).format(new Date(raw));
  const time = (raw: string) => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: value.timeZone }).format(new Date(raw));
  async function run(action: () => Promise<void>) { setBusy(true); setError(''); try { await action(); } catch(e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); } }
  async function contact() { await run(async () => { await api(url,{ action:'START' }); await refresh(); setOpened(true); const picked = windows.find(w => w.startAt === selected); if (!body && picked) setBody(`${locale === 'zh-CN' ? '你好！这个时间方便吗：' : locale === 'de' ? 'Hallo! Passt dir ' : 'Hi! Does this time work: '}${date(picked.startAt)} ${time(picked.startAt)} – ${time(picked.endAt)}?`); setTimeout(() => chat.current?.scrollIntoView({ behavior:'smooth', block:'start' }),100); }); }
  async function send(e: FormEvent) { e.preventDefault(); await run(async () => {
    const picked = value.timeWindows.find(w => w.startAt === selected);
    if (conversation.state === 'NEW' && selected !== null && !picked) {
      setSelected(null); throw new Error(t.timeChanged);
    }
    const selectedTime = conversation.state === 'NEW' && picked
      ? { intentVersion: value.version, startAt: picked.startAt, endAt: picked.endAt } : undefined;
    const payload = { action:'SEND', body, ...(selectedTime ? { selectedTime } : {}) };
    const fingerprint = JSON.stringify(payload);
    if (!messageKey.current || messageKey.current.body !== fingerprint) messageKey.current = { body: fingerprint, key: crypto.randomUUID() };
    try { await api(url,payload,messageKey.current.key); }
    catch (cause) {
      if ((cause as {field?: string}).field === 'selectedTime') {
        await refresh(); setSelected(null); messageKey.current = null;
        throw new Error(t.timeChanged);
      }
      throw cause;
    }
    messageKey.current=null; setBody(''); followLatest.current=true; await refresh();
  }); }
  async function saveContact() { await run(async () => {
    const auth = await api(url,{ action:'START' }); await refresh();
    if (auth.isGuest) { setUsername(`seat_${crypto.randomUUID().slice(0,8)}`); setAfterRegister(null); setModal('register'); }
    else setModal('complete');
  }); }
  async function register(e: FormEvent) { e.preventDefault(); if (usernameCheck.blocked || busy) return; await run(async () => {
    const account = await api(url,{action:'REGISTER',username,password}) as { username: string };
    setPassword(''); ++revision.current;
    setConversation(previous=>({...previous,isGuest:false,username:account.username}));
    setNotice('');
    // The account already exists even if the following conversation refresh fails.
    setModal('complete');
    if (afterRegister) await acceptPlan(afterRegister.id);
    else await refresh();
  }); }
  async function acceptPlan(id: string) {
    const current = await refresh();
    const plan = current.messages.find(message => message.plan?.id === id)?.plan;
    if (!plan?.canAccept) { setNotice(t.planChanged); return; }
    if (!planKeys.current.has(id)) planKeys.current.set(id, crypto.randomUUID());
    await api(`/api/v1/plans/${id}/accept`, {}, planKeys.current.get(id));
    await refresh(); setNotice(t.planAccepted);
  }
  async function joinPlan(plan: SharedPlan) { await run(async () => {
    if (conversation.isGuest) {
      setUsername(`seat_${crypto.randomUUID().slice(0,8)}`); setAfterRegister(plan); setModal('register');
    } else await acceptPlan(plan.id);
  }); }
  function finishModal() { setModal(null); }
  const appURL = conversation.connectionId ? `sideseat://connections/${encodeURIComponent(conversation.connectionId)}` : 'sideseat://inbox';
  const appHelp = <details className={styles.appHelp}><summary>{t.appNotOpened}</summary><p>{t.appBrowserHint}</p>
    {installURL?<a className={styles.secondary} href={installURL} target="_blank" rel="noreferrer">{t.installApp}</a>:<p>{t.appInstallHint}</p>}
  </details>;
  const appLink = <a className={`${styles.primary} ${styles.appOpen}`} href={appURL} aria-disabled={busy} onClick={event=>{if(busy) event.preventDefault();}}>{busy?t.busy:t.open}</a>;
  const timing = value.timePreference;
  return <main lang={locale} className={styles.page}><div className={styles.wrap}>
    <header className={styles.brand}>SideSeat<select aria-label="Language" value={locale} onChange={e=>changeLanguage(e.target.value)}><option value="zh-CN">中文</option><option value="en">EN</option><option value="de">DE</option></select></header>
    <section className={styles.card} aria-label={t.invitation}>
      <div className={styles.byline}><div className={styles.avatar}>{value.host.slice(0,1)}</div><strong>{value.host}</strong><button className={styles.icon} aria-label={t.copy} onClick={()=>run(async()=>{await navigator.clipboard.writeText(recipientURL());setNotice(t.copied);})}><Copy size={19}/></button></div>
      <h1>{value.title}</h1>{value.note && <p className={styles.note}>{value.note}</p>}
      <div className={styles.divider}/><div className={styles.sectionTitle}><Clock3 size={18}/><h2>{t.availability}</h2><span>{value.timeZone}</span></div>
      {windows.length > 0 ? <div className={styles.times}>{windows.map(w=><button key={w.startAt} aria-pressed={w.startAt===selected} className={w.startAt===selected?styles.selected:''} onClick={()=>setSelected(w.startAt)}><span>{date(w.startAt)}</span><strong>{time(w.startAt)} – {time(w.endAt)}{date(w.startAt)!==date(w.endAt)?` · ${date(w.endAt)}`:''}</strong>{w.startAt===selected?<Check size={17}/>:<span className={styles.radio}/>}</button>)}<button aria-pressed={selected===null} onClick={()=>setSelected(null)} className={selected===null?styles.selected:''}>{t.undecided}</button></div> : <div className={styles.flexible}><strong>{timing?.kind==='FLEXIBLE'?t.flexible:t.undecided}</strong>{timing?.kind==='FLEXIBLE'&&<p>{timing.startDate} — {timing.endDate} · {({ANY:t.any,MORNING:t.morning,AFTERNOON:t.afternoon,EVENING:t.evening} as Record<string,string>)[timing.period || 'ANY']}</p>}</div>}
      {conversation.state==='OWNER'?<p className={styles.hint}>{t.owner}</p>:!value.acceptingContacts?<p className={styles.hint}>{t.intentionClosed}</p>:<>{!opened&&<><button className={styles.primary} disabled={busy} onClick={contact}><MessageCircle size={20}/>{busy?t.busy:t.contact}<ChevronRight size={19}/></button><p className={styles.underButton}>{t.noAccount}</p></>}</>}
    </section>
    {opened&&conversation.state!=='OWNER'&&<section ref={chat} className={styles.card} aria-label={t.chat}><div className={styles.sectionTitle}><MessageCircle size={19}/><h2>{t.chat}</h2><span className={styles.dot} role="status" aria-label={unavailable?t.unavailable:syncing?t.reconnecting:t.live}/></div>
      {(unavailable||syncing)&&<p className={styles.sync} role="status">{unavailable?t.unavailable:t.reconnecting}</p>}
      {conversation.isGuest&&<p className={styles.hint}>{t.guest}</p>}
      <div ref={messages} className={styles.messages} aria-live="polite" onScroll={()=>{
        const box=messages.current; if (!box) return;
        followLatest.current=box.scrollHeight-box.scrollTop-box.clientHeight<64;
        if(followLatest.current) setUnread(false);
      }}>{conversation.messages.map(m=><div key={m.id} className={`${styles.message} ${m.mine?styles.mine:''} ${m.plan?styles.planMessage:''}`}>
        {m.plan?<article aria-label={t.planInvitation} className={styles.planCard}>
          <div className={styles.planLabel}><CalendarPlus size={16}/>{t.planInvitation}<span>{({PENDING:t.planPending,ACCEPTED:t.planConfirmed,DECLINED:t.planDeclined,CANCELED:t.planCanceled,COUNTERED:t.planCountered,EXPIRED:t.planExpired} as Record<string,string>)[m.plan.status] || t.planChanged}</span></div>
          <h3>{m.plan.title}</h3>
          <p><Clock3 size={16}/><span>{date(m.plan.startAt)} · {time(m.plan.startAt)} – {date(m.plan.startAt)!==date(m.plan.endAt)?`${date(m.plan.endAt)} · `:''}{time(m.plan.endAt)}<small>{value.timeZone}</small></span></p>
          {m.plan.location&&<p><MapPin size={16}/><span>{m.plan.location}</span></p>}
          {m.plan.note&&<p className={styles.planNote}>{m.plan.note}</p>}
          {m.plan.canAccept&&!unavailable&&<><button type="button" className={styles.primary} disabled={busy} onClick={()=>joinPlan(m.plan!)}>{busy?t.busy:conversation.isGuest?t.registerAccept:t.acceptPlan}</button><p className={styles.planHint}>{conversation.isGuest?t.planSignupHint:t.planAcceptHint}</p></>}
          {m.plan.status==='ACCEPTED'&&<p className={styles.planHint}><Check size={16}/>{t.planAccepted}</p>}
        </article>:<p>{m.type==='TEXT'?m.body:t.plan}</p>}
        <time>{new Intl.DateTimeFormat(locale,{hour:'2-digit',minute:'2-digit'}).format(new Date(m.createdAt))}</time>
      </div>)}</div>
      {unread&&<button type="button" className={styles.newMessages} onClick={()=>{followLatest.current=true;if(messages.current) messages.current.scrollTop=messages.current.scrollHeight;setUnread(false);}}>{t.newMessages} ↓</button>}
      {conversation.state==='WAITING'?<p className={styles.waiting}><Check size={17}/>{t.waiting}</p>:<form onSubmit={send} className={styles.composer}><textarea aria-label={t.hello} placeholder={t.hello} maxLength={500} rows={2} required value={body} onChange={e=>setBody(e.target.value)} disabled={unavailable}/><button aria-label={t.send} disabled={busy||unavailable||!body.trim()}><Send size={19}/></button></form>}
      {conversation.isGuest&&<div className={styles.savePrompt}><strong>{t.save}</strong><button disabled={busy} onClick={()=>saveContact()}>{t.register}<ChevronRight size={16}/></button></div>}
    </section>}
    {!conversation.isGuest&&conversation.state!=='OWNER'&&<section className={styles.appBar} aria-label={t.continueInApp}><div><strong>{t.continueInApp}</strong><span>{conversation.username}</span></div>{appLink}</section>}
    {!modal&&error&&<p role="alert" className={styles.error}>{error}</p>}{!modal&&notice&&<p role="status" className={styles.notice}><Check size={17}/>{notice}</p>}
    <footer className={styles.footer}><a href="/privacy">{locale==='zh-CN'?'隐私政策':locale==='de'?'Datenschutz':'Privacy'}</a></footer>
    <dialog ref={dialog} className={styles.dialog} aria-modal="true" aria-labelledby="share-dialog-title" onCancel={event=>{event.preventDefault();if(!busy) finishModal();}}><button className={styles.close} aria-label={t.close} disabled={busy} onClick={finishModal}><X size={21}/></button>
      {modal==='register'?<form onSubmit={register}><div className={styles.modalIcon}>{afterRegister?<CalendarPlus/>:<MessageCircle/>}</div><h2 id="share-dialog-title">{afterRegister?t.registerAccept:t.save}</h2><p>{afterRegister?t.planSignupHint:t.benefits}</p>{afterRegister&&<div className={styles.registrationPlan}><strong>{afterRegister.title}</strong><p>{date(afterRegister.startAt)} · {time(afterRegister.startAt)} – {date(afterRegister.startAt)!==date(afterRegister.endAt)?`${date(afterRegister.endAt)} · `:''}{time(afterRegister.endAt)}</p>{afterRegister.location&&<p>{afterRegister.location}</p>}</div>}<label>{t.username}<input autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={e=>{setUsername(e.target.value);setError('');}} onBlur={usernameCheck.onBlur} aria-describedby="share-username-status" aria-invalid={usernameCheck.status==='taken'||usernameCheck.status==='invalid'} required minLength={2} maxLength={32}/></label><p id="share-username-status" className={styles.usernameStatus} role="status" aria-live="polite" data-state={usernameCheck.status}>{usernameMessage}</p><label>{t.password}<input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={8} maxLength={72}/></label><button className={styles.primary} disabled={busy||usernameCheck.blocked}>{busy?t.busy:afterRegister?t.registerAccept:t.register}</button><p className={styles.legal}>{t.terms} <a href="/privacy" target="_blank" rel="noreferrer">Privacy</a></p><button type="button" className={styles.textAction} onClick={()=>setModal(null)}>{t.later}</button></form>:
      modal==='complete'?<div className={styles.appPrompt}><div className={styles.modalIcon}><Check/></div><h2 id="share-dialog-title" tabIndex={-1}>{t.accountReady}</h2><p className={styles.completionStatus} role="status">{notice || (conversation.messages.length?t.conversationSaved:'')}</p><div className={styles.accountName}><span>{t.username}</span><strong>{conversation.username}</strong></div><p>{t.appLoginHint}</p>{appLink}<button type="button" className={styles.textAction} disabled={busy} onClick={finishModal}>{t.continueWeb}</button>{appHelp}</div>:
      null}
      {modal&&error&&<p role="alert" className={styles.error}>{error}</p>}
    </dialog>
  </div></main>;
}
