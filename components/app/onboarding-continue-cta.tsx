import { Sparkles } from "lucide-react";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";

export function OnboardingContinueCta({
  title = "Finish your setup",
  body = "You can already browse the app. Complete your profile anytime to unlock the full experience.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <Card className="rounded-2xl border-classmates-edge bg-classmates-surface p-4 shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-classmates-warm-alt text-classmates-blue dark:bg-muted dark:text-foreground">
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle className="text-[15px]">{title}</CardTitle>
          <CardDescription className="mt-1 text-[13px] leading-snug">{body}</CardDescription>
          <LinkButton href="/onboarding" size="sm" className="mt-3 rounded-full">
            Continue setup
          </LinkButton>
        </div>
      </div>
    </Card>
  );
}
