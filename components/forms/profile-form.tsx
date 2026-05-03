"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { AvatarPicker } from "@/components/forms/avatar-picker";
import { SearchableSelect } from "@/components/forms/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormMessage } from "@/components/forms/form-message";
import { schoolOptions } from "@/lib/constants/schools";
import {
  DEGREE_LEVEL_LABELS,
  DEGREE_LEVELS,
  MAJORS_BY_LEVEL,
  semesterOptions,
} from "@/lib/constants/majors";
import { profileSchema } from "@/lib/validators/profile";

type ProfileValues = z.infer<typeof profileSchema>;

export function ProfileForm({
  initialValues,
  submitLabel,
  avatarId,
  verificationSlot,
  /** School/program only; avatar, name, bio are edited on Me /profile. Contact handles are onboarding (`full`) only. */
  variant = "full",
}: {
  initialValues: ProfileValues;
  submitLabel: string;
  avatarId: string | null;
  /** Rendered inside the Academic card so school + verification feel like one module. */
  verificationSlot?: React.ReactNode;
  variant?: "full" | "academicOnly";
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: initialValues,
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError("");

    const response = await fetch("/api/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(values),
    });

    const payload = await response.json();

    if (!response.ok) {
      setServerError(payload.error ?? "Unable to save profile.");
      return;
    }

    router.refresh();
  });

  const degreeLevel = watch("degreeLevel");
  const semester = watch("semester");
  const currentMajor = watch("major");

  // Build the major list for the selected degree level. Preserve any legacy
  // free-text major so old rows don't silently get reset to empty.
  const baseMajors = degreeLevel ? MAJORS_BY_LEVEL[degreeLevel] : [];
  const majorOptions =
    currentMajor && baseMajors.length && !baseMajors.includes(currentMajor)
      ? [currentMajor, ...baseMajors]
      : baseMajors;

  const semesterChoices = semesterOptions(degreeLevel);

  // Clamp semester if the user switches to a level with a lower max.
  useEffect(() => {
    if (!degreeLevel) return;
    const max = semesterChoices[semesterChoices.length - 1];
    if (typeof semester === "number" && semester > max) {
      setValue("semester", max, { shouldValidate: true });
    }
  }, [degreeLevel, semester, semesterChoices, setValue]);

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <section className="space-y-3 rounded-3xl border border-border bg-card p-4">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          School and program
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <FieldLabel>School</FieldLabel>
            <select
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
              {...register("school")}
            >
              {schoolOptions.map((school) => (
                <option key={school.value} value={school.value}>
                  {school.shortLabel}
                </option>
              ))}
            </select>
            <FormMessage message={errors.school?.message} />
          </div>
          <div className="space-y-1">
            <FieldLabel>Degree</FieldLabel>
            <select
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
              {...register("degreeLevel")}
            >
              {DEGREE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {DEGREE_LEVEL_LABELS[level]}
                </option>
              ))}
            </select>
            <FormMessage message={errors.degreeLevel?.message} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <FieldLabel>Major</FieldLabel>
            <input type="hidden" {...register("major")} />
            <SearchableSelect
              value={currentMajor ?? ""}
              options={majorOptions}
              onChange={(value) => setValue("major", value, { shouldValidate: true })}
            />
            <FormMessage message={errors.major?.message} />
          </div>
          <div className="space-y-1">
            <FieldLabel>Semester</FieldLabel>
            <select
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
              {...register("semester", { valueAsNumber: true })}
            >
              {semesterChoices.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <FormMessage message={errors.semester?.message} />
          </div>
        </div>
        {verificationSlot}
      </section>

      {variant === "academicOnly" ? (
        <>
          <input type="hidden" {...register("wechatHandle")} />
          <input type="hidden" {...register("whatsappHandle")} />
          <input type="hidden" {...register("telegramHandle")} />
          <input type="hidden" {...register("instagramHandle")} />
        </>
      ) : (
        <section className="rounded-3xl border border-border bg-card p-4">
          <p className="mb-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Contact (optional)
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Input {...register("wechatHandle")} placeholder="WeChat" />
            <Input {...register("whatsappHandle")} placeholder="WhatsApp" />
            <Input {...register("telegramHandle")} placeholder="Telegram" />
            <Input {...register("instagramHandle")} placeholder="Instagram" />
          </div>
        </section>
      )}

      {variant === "academicOnly" ? (
        <>
          <input type="hidden" {...register("nickname")} />
          <input type="hidden" {...register("bio")} />
        </>
      ) : (
        <section className="space-y-3 rounded-3xl border border-border bg-card p-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Home and profile
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Avatar, name, and tagline — also shown to classmates.
            </p>
          </div>
          <AvatarPicker initialId={avatarId}>
            <Input {...register("nickname")} placeholder="Nickname" />
            <FormMessage message={errors.nickname?.message} />
          </AvatarPicker>
          <div className="space-y-1">
            <Textarea
              {...register("bio")}
              placeholder="Tagline — one short line, like a status or signature"
              rows={2}
            />
            <FormMessage message={errors.bio?.message} />
          </div>
        </section>
      )}

      <FormMessage message={serverError} />

      <Button className="w-full" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}
