"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { AvatarPicker } from "@/components/forms/avatar-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormMessage } from "@/components/forms/form-message";
import { getSchoolLabel } from "@/lib/constants/schools";
import { profileSchema } from "@/lib/validators/profile";

type ProfileValues = z.infer<typeof profileSchema>;

export function ProfileForm({
  initialValues,
  submitLabel,
  avatarId,
}: {
  initialValues: ProfileValues;
  submitLabel: string;
  avatarId: string | null;
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

  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <AvatarPicker initialId={avatarId} />

      <div className="grid gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Nickname</label>
          <Input {...register("nickname")} placeholder="QuietCoder" />
          <FormMessage message={errors.nickname?.message} />
        </div>
        <input type="hidden" {...register("school")} value="TUM" />
        <div className="space-y-1 rounded-3xl border border-border bg-muted/30 px-4 py-3">
          <p className="text-xs text-muted-foreground">School</p>
          <p className="text-sm font-medium">{getSchoolLabel("TUM")}</p>
          <p className="text-xs text-muted-foreground">
            Only TUM is supported right now. More schools coming soon.
          </p>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Major</label>
          <Input {...register("major")} placeholder="Robotics" />
          <FormMessage message={errors.major?.message} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Semester</label>
          <Input type="number" {...register("semester", { valueAsNumber: true })} />
          <FormMessage message={errors.semester?.message} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Tagline</label>
          <Textarea
            {...register("bio")}
            placeholder="One short line — like a status or signature."
            rows={3}
          />
          <p className="text-xs text-muted-foreground">Up to 120 characters.</p>
          <FormMessage message={errors.bio?.message} />
        </div>
      </div>

      <div className="space-y-3 rounded-3xl border border-border bg-card p-4">
        <p className="text-sm font-medium">Discovery & privacy</p>
        <div className="space-y-3">
          <Checkbox
            checked={watch("discoverByCourse")}
            onChange={(checked) => setValue("discoverByCourse", checked)}
            label="Show me people through shared courses"
          />
          <Checkbox
            checked={watch("discoverByMajor")}
            onChange={(checked) => setValue("discoverByMajor", checked)}
            label="Show me people through shared majors"
          />
          <Checkbox
            checked={watch("discoverBySemester")}
            onChange={(checked) => setValue("discoverBySemester", checked)}
            label="Show me people through shared semesters"
          />
          <Checkbox
            checked={watch("allowInvitationNotes")}
            onChange={(checked) => setValue("allowInvitationNotes", checked)}
            label="Allow invitation notes"
          />
          <Checkbox
            checked={watch("contactInfoOptIn")}
            onChange={(checked) => setValue("contactInfoOptIn", checked)}
            label="Allow contact exchange requests"
          />
        </div>
      </div>

      <div className="space-y-3 rounded-3xl border border-border bg-card p-4">
        <p className="text-sm font-medium">Private contact handles</p>
        <div className="grid gap-3">
          <Input {...register("wechatHandle")} placeholder="WeChat" />
          <Input {...register("whatsappHandle")} placeholder="WhatsApp" />
          <Input {...register("telegramHandle")} placeholder="Telegram" />
          <Input {...register("instagramHandle")} placeholder="Instagram" />
        </div>
      </div>

      <FormMessage message={serverError} />

      <Button className="w-full" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}
