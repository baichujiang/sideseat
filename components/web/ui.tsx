"use client";
import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Loader2,
  X,
  type LucideIcon,
} from "lucide-react";
export function Avatar({
  name,
  url,
  size = "",
}: {
  name: string;
  url?: string | null;
  size?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return (
    <span className={`sw-avatar ${size}`} aria-label={name}>
      {url && !failed ? (
        <Image
          unoptimized
          src={url}
          width={65}
          height={65}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        name.trim().slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="sw-page-heading">
      <div>
        <p className="sw-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description ? <p className="sw-subtitle">{description}</p> : null}
      </div>
      <div className="sw-heading-actions">{children}</div>
    </header>
  );
}
export function Empty({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="sw-empty">
      <span className="sw-empty-icon">
        <Icon size={27} strokeWidth={1.5} />
      </span>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}
export function ErrorNotice({
  message,
  retry,
}: {
  message?: string;
  retry?: () => void;
}) {
  return message ? (
    <div className="sw-error" role="alert">
      <AlertCircle size={18} />
      <span>{message}</span>
      {retry ? (
        <button type="button" onClick={retry}>
          重试
        </button>
      ) : null}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="sw-loading" role="status">
      <Loader2 className="sw-spin" size={23} />
      <span>正在加载…</span>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`sw-dialog ${wide ? "sw-dialog-wide" : ""}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sw-dialog-inner">
        <header>
          <h2>{title}</h2>
          <button
            className="sw-icon-button"
            type="button"
            aria-label="关闭"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="sw-field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}
export function ExternalMark() {
  return <ArrowUpRight size={15} aria-hidden />;
}
