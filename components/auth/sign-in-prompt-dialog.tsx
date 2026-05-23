"use client";

import type { Route } from "next";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { LinkButton } from "@/components/ui/link-button";
import { useAppMessages } from "@/hooks/use-app-locale";
import { withReturnTo } from "@/lib/nav/back";
import { cn } from "@/lib/utils";

type PromptState = {
  open: boolean;
  returnTo: string;
  title?: string;
  body?: string;
};

type SignInPromptContextValue = {
  openPrompt: (opts?: { returnTo?: string; title?: string; body?: string }) => void;
  closePrompt: () => void;
};

const SignInPromptContext = createContext<SignInPromptContextValue | null>(null);

export function SignInPromptProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PromptState>({ open: false, returnTo: "/" });

  const openPrompt = useCallback(
    (opts?: { returnTo?: string; title?: string; body?: string }) => {
      const returnTo =
        opts?.returnTo ??
        (typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : "/");
      setState({
        open: true,
        returnTo,
        title: opts?.title,
        body: opts?.body,
      });
    },
    [],
  );

  const closePrompt = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
  }, []);

  const value = useMemo(() => ({ openPrompt, closePrompt }), [openPrompt, closePrompt]);

  return (
    <SignInPromptContext.Provider value={value}>
      {children}
      <SignInPromptDialog state={state} onClose={closePrompt} />
    </SignInPromptContext.Provider>
  );
}

export function useSignInPrompt() {
  const ctx = useContext(SignInPromptContext);
  if (!ctx) {
    throw new Error("useSignInPrompt must be used within SignInPromptProvider");
  }
  return ctx;
}

function SignInPromptDialog({
  state,
  onClose,
}: {
  state: PromptState;
  onClose: () => void;
}) {
  const m = useAppMessages();
  if (!state.open) return null;

  const title = state.title?.trim() || m.guest.signInPromptTitle;
  const body = state.body?.trim() || m.guest.signInPromptBody;
  const loginHref = withReturnTo("/login", state.returnTo) as Route;
  const signupHref = withReturnTo("/signup", state.returnTo) as Route;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sign-in-prompt-title"
        className={cn(
          "w-full max-w-sm rounded-2xl border border-border/70 bg-card px-4 py-5 shadow-lg",
          "animate-in fade-in slide-in-from-bottom-4 duration-200",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="sign-in-prompt-title" className="text-[17px] font-semibold text-foreground">
          {title}
        </h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">{body}</p>
        <div className="mt-4 grid gap-2">
          <LinkButton href={signupHref} className="w-full" onClick={onClose}>
            {m.guest.createAccount}
          </LinkButton>
          <LinkButton href={loginHref} variant="outline" className="w-full" onClick={onClose}>
            {m.guest.logIn}
          </LinkButton>
          <button
            type="button"
            className="text-center text-[13px] text-muted-foreground underline-offset-2 hover:underline"
            onClick={onClose}
          >
            {m.common.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
