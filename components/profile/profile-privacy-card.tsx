"use client";

import { useState } from "react";
import { Shield } from "lucide-react";

import { apiFetch } from "@/lib/auth/api-fetch";
import { meSettingsRowListIconShellLargeClass } from "@/components/profile/me-settings-row";
import { useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";

const cardClass =
  "rounded-2xl border border-classmates-edge bg-classmates-surface shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card";

const toggleRowClass =
  "flex items-center justify-between gap-3 border-t border-classmates-hairline px-4 py-3.5 first:border-t-0 dark:border-border/60";

type PrivacyValues = {
  hideFromDiscovery: boolean;
  hideFromRecommendations: boolean;
  hideFromCourseMembers: boolean;
};

export function ProfilePrivacyCard({ initialValues }: { initialValues: PrivacyValues }) {
  const pf = useAppMessages().profileForm;
  const [values, setValues] = useState(initialValues);
  const [busyKey, setBusyKey] = useState<keyof PrivacyValues | null>(null);
  const [error, setError] = useState("");

  const patchField = async (key: keyof PrivacyValues, next: boolean) => {
    const prev = values[key];
    setBusyKey(key);
    setError("");
    setValues((v) => ({ ...v, [key]: next }));

    const res = await apiFetch("/api/profile/privacy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: next }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setBusyKey(null);

    if (!res.ok) {
      setValues((v) => ({ ...v, [key]: prev }));
      setError(typeof body.error === "string" ? body.error : pf.unableToSave);
    }
  };

  const toggles: Array<{
    key: keyof PrivacyValues;
    title: string;
    subtitle: string;
  }> = [
    {
      key: "hideFromDiscovery",
      title: pf.hideFromDiscoveryTitle,
      subtitle: pf.hideFromDiscoverySubtitle,
    },
    {
      key: "hideFromRecommendations",
      title: pf.hideFromRecommendationsTitle,
      subtitle: pf.hideFromRecommendationsSubtitle,
    },
    {
      key: "hideFromCourseMembers",
      title: pf.hideInCourseTitle,
      subtitle: pf.hideInCourseSubtitle,
    },
  ];

  return (
    <div className={cn(cardClass, "overflow-hidden")}>
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span className={meSettingsRowListIconShellLargeClass}>
          <Shield className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-tight text-foreground">{pf.privacyHeading}</p>
        </div>
      </div>
      {toggles.map((row) => {
        const checked = values[row.key];
        const busy = busyKey === row.key;
        return (
          <label key={row.key} className={toggleRowClass}>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-foreground">{row.title}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{row.subtitle}</span>
            </span>
            <input
              type="checkbox"
              checked={checked}
              disabled={busy || busyKey !== null}
              className="h-4 w-4 shrink-0 rounded border-border text-primary accent-primary disabled:opacity-50"
              onChange={(e) => void patchField(row.key, e.target.checked)}
            />
          </label>
        );
      })}
      {error ? (
        <p className="border-t border-classmates-hairline px-4 py-2 text-[12px] text-destructive dark:border-border/60" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
