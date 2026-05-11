"use client";

import { Sparkles } from "lucide-react";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { useAppMessages } from "@/hooks/use-app-locale";

export function OnboardingContinueCta({
  title,
  body,
}: {
  title?: string;
  body?: string;
}) {
  const m = useAppMessages();
  const t = title?.trim() ? title : m.onboarding.genericTitle;
  const d = body?.trim() ? body : m.onboarding.genericBody;

  return (
    <Card className="rounded-2xl border-classmates-edge bg-classmates-surface p-4 shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-classmates-warm-alt text-classmates-blue dark:bg-muted dark:text-foreground">
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle className="text-[15px]">{t}</CardTitle>
          <CardDescription className="mt-1 text-[13px] leading-snug">{d}</CardDescription>
          <LinkButton href="/onboarding" size="sm" className="mt-3 rounded-full">
            {m.onboarding.continueSetup}
          </LinkButton>
        </div>
      </div>
    </Card>
  );
}
