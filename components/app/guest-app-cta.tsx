import type { Route } from "next";

import { LinkButton } from "@/components/ui/link-button";
import { withReturnTo } from "@/lib/nav/back";

/**
 * Shown on main tab pages when there is no signed-in session. Keeps the app
 * chrome (bottom nav) visible while making the next step obvious.
 */
export function GuestAppCta({
  headline = "Sign in to continue",
  body = "Create an account or log in to sync your courses, messages, and profile.",
  returnTo,
}: {
  headline?: string;
  body?: string;
  /** After login/signup, send the user back here (safe paths only — callers should pass a same-tab path like `/courses`). */
  returnTo?: string;
}) {
  const loginHref = (returnTo
    ? withReturnTo("/login", returnTo)
    : "/login") as Route;
  const signupHref = (returnTo
    ? withReturnTo("/signup", returnTo)
    : "/signup") as Route;

  return (
    <div className="rounded-2xl border border-border/60 bg-card px-4 py-5 shadow-[0_2px_16px_-4px_rgba(15,23,42,0.06)]">
      <p className="text-[15px] font-semibold text-foreground">{headline}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
        {body}
      </p>
      <div className="mt-4 grid gap-2.5">
        <LinkButton href={signupHref} className="w-full">
          Create account
        </LinkButton>
        <LinkButton href={loginHref} variant="outline" className="w-full">
          Log in
        </LinkButton>
      </div>
      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        You can browse the app layout first — your data stays private until you
        sign in.
      </p>
    </div>
  );
}
