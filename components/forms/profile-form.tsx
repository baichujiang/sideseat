"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { AvatarPicker } from "@/components/forms/avatar-picker";
import { SearchableSelect } from "@/components/forms/searchable-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormMessage } from "@/components/forms/form-message";
import { getSchoolLabel } from "@/lib/constants/schools";
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
}: {
  initialValues: ProfileValues;
  submitLabel: string;
  avatarId: string | null;
  /** Rendered inside the Academic card so school + verification feel like one module. */
  verificationSlot?: React.ReactNode;
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
    defaultValues: { ...initialValues, school: "TUM" },
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
      <input type="hidden" {...register("school")} value="TUM" />

      <AvatarPicker initialId={avatarId}>
        <label className="block text-xs font-medium text-muted-foreground">Nickname</label>
        <Input {...register("nickname")} placeholder="QuietCoder" />
        <FormMessage message={errors.nickname?.message} />
      </AvatarPicker>

      <section className="space-y-3 rounded-3xl border border-border bg-card p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Academic</h2>
          <span className="text-xs text-muted-foreground">{getSchoolLabel("TUM")}</span>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Degree</label>
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
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Major</label>
            <input type="hidden" {...register("major")} />
            <SearchableSelect
              value={currentMajor ?? ""}
              options={majorOptions}
              onChange={(value) => setValue("major", value, { shouldValidate: true })}
            />
            <FormMessage message={errors.major?.message} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Semester</label>
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

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Tagline</label>
        <Textarea
          {...register("bio")}
          placeholder="One short line — like a status or signature."
          rows={2}
        />
        <FormMessage message={errors.bio?.message} />
      </div>

      <section className="space-y-2 rounded-3xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">Discovery</p>
        <div className="grid gap-1.5">
          <Checkbox
            checked={watch("discoverByCourse")}
            onChange={(checked) => setValue("discoverByCourse", checked)}
            label="Shared courses"
          />
          <Checkbox
            checked={watch("discoverByMajor")}
            onChange={(checked) => setValue("discoverByMajor", checked)}
            label="Same major"
          />
          <Checkbox
            checked={watch("discoverBySemester")}
            onChange={(checked) => setValue("discoverBySemester", checked)}
            label="Same semester"
          />
          <Checkbox
            checked={watch("allowInvitationNotes")}
            onChange={(checked) => setValue("allowInvitationNotes", checked)}
            label="Allow invitation notes"
          />
          <Checkbox
            checked={watch("contactInfoOptIn")}
            onChange={(checked) => setValue("contactInfoOptIn", checked)}
            label="Allow contact exchange"
          />
        </div>
      </section>

      <section className="space-y-2 rounded-3xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">Contact handles</p>
        <div className="grid grid-cols-2 gap-2">
          <Input {...register("wechatHandle")} placeholder="WeChat" />
          <Input {...register("whatsappHandle")} placeholder="WhatsApp" />
          <Input {...register("telegramHandle")} placeholder="Telegram" />
          <Input {...register("instagramHandle")} placeholder="Instagram" />
        </div>
      </section>

      <FormMessage message={serverError} />

      <Button className="w-full" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}
