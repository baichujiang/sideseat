"use client";

import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
};

export function PasswordField({ label, id, ...props }: PasswordFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = input.current?.form;
    const hide = () => setVisible(false);
    form?.addEventListener("reset", hide);
    return () => form?.removeEventListener("reset", hide);
  }, []);

  return (
    <div className="sw-field">
      <label htmlFor={inputId}>{label}</label>
      <div className="sw-password-control">
        <input {...props} ref={input} id={inputId} type={visible ? "text" : "password"} />
        <button
          type="button"
          className="sw-password-toggle"
          aria-label={`${visible ? "隐藏" : "显示"}${label}`}
          aria-controls={inputId}
          aria-pressed={visible}
          title={visible ? "隐藏密码" : "显示密码"}
          disabled={props.disabled}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      </div>
    </div>
  );
}
