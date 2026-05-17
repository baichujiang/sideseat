"use client";

import type { Route } from "next";

import { AppPushLayer } from "@/components/ui/app-push-layer";
import { LinkButton } from "@/components/ui/link-button";
import { useAppMessages } from "@/hooks/use-app-locale";
import { withReturnTo } from "@/lib/nav/back";

export function ScheduleShareProposalAuthSheet({
  open,
  onClose,
  message,
  returnTo,
  continueEditingLabel,
}: {
  open: boolean;
  onClose: () => void;
  message: string;
  returnTo: string;
  continueEditingLabel: string;
}) {
  const m = useAppMessages();
  const loginHref = (withReturnTo("/login", returnTo) || "/login") as Route;
  const signupHref = (withReturnTo("/signup", returnTo) || "/signup") as Route;

  return (
    <AppPushLayer
      open={open}
      onClose={onClose}
      zClassName="z-[60]"
      panelClassName="w-full max-w-lg border-0 rounded-t-2xl"
    >
      <div className="px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted" aria-hidden />
        <p className="text-center text-[15px] font-semibold leading-snug text-foreground">{message}</p>
        <div className="mt-4 grid gap-2">
          <LinkButton href={signupHref} className="w-full">
            {m.guest.createAccount}
          </LinkButton>
          <LinkButton href={loginHref} variant="outline" className="w-full">
            {m.guest.logIn}
          </LinkButton>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full py-2 text-center text-[12px] font-medium text-muted-foreground hover:text-foreground"
        >
          {continueEditingLabel}
        </button>
      </div>
    </AppPushLayer>
  );
}
