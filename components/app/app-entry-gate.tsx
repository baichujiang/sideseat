"use client";

import { GuestBrowseButton } from "@/components/auth/guest-browse-button";
import { LinkButton } from "@/components/ui/link-button";
import { APP_NAME } from "@/lib/constants/app";

/**
 * Minimal mobile-style entry when not signed in: no marketing blocks, no sign-up on this screen.
 */
export function AppEntryGate() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-background px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))]">
      <div className="flex flex-1 flex-col justify-center gap-10">
        <div className="space-y-2 text-center">
          <p className="text-sm font-medium text-muted-foreground">{APP_NAME}</p>
          <h1 className="text-2xl font-semibold leading-snug tracking-tight text-foreground">
            Courses & classmates
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Sign in to sync your data, or browse courses as a guest.
          </p>
        </div>

        <div className="grid gap-3">
          <LinkButton className="w-full" href="/signup">
            Create account
          </LinkButton>
          <LinkButton className="w-full" href="/login" variant="outline">
            Log in
          </LinkButton>
          <GuestBrowseButton className="w-full" />
        </div>
      </div>
    </main>
  );
}
