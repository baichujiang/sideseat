"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { StudentVerificationStatus, type UserGender } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DEGREE_LEVEL_LABELS,
  DEGREE_LEVELS,
  semesterOptions,
} from "@/lib/constants/majors";
import { USER_GENDER_OPTIONS } from "@/lib/constants/gender";
import { schoolOptions } from "@/lib/constants/schools";

export type AdminUserFormInitialValues = {
  nickname: string;
  gender: UserGender;
  email: string;
  school: string;
  degreeLevel: (typeof DEGREE_LEVELS)[number] | "";
  major: string;
  semester: number | "";
  bio: string;
  wechatHandle: string;
  whatsappHandle: string;
  telegramHandle: string;
  instagramHandle: string;
  verifiedStudent: boolean;
  studentVerificationStatus: StudentVerificationStatus;
  studentVerificationNotes: string;
  onboardingComplete: boolean;
};

const VERIFICATION_STATUSES: StudentVerificationStatus[] = [
  StudentVerificationStatus.UNVERIFIED,
  StudentVerificationStatus.EMAIL_PENDING,
  StudentVerificationStatus.MANUAL_REVIEW_REQUIRED,
  StudentVerificationStatus.VERIFIED,
  StudentVerificationStatus.REJECTED,
];

export function AdminUserEditForm({
  userId,
  initial,
}: {
  userId: string;
  initial: AdminUserFormInitialValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const set = <K extends keyof AdminUserFormInitialValues>(
    key: K,
    value: AdminUserFormInitialValues[K],
  ) => setValues((prev) => ({ ...prev, [key]: value }));

  const semesterChoices = values.degreeLevel
    ? semesterOptions(values.degreeLevel)
    : semesterOptions("BACHELOR");

  const submit = () =>
    startTransition(async () => {
      setMessage("");
      setError("");

      const response = await apiFetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: values.nickname || undefined,
          gender: values.gender,
          email: values.email,
          school: values.school || undefined,
          degreeLevel: values.degreeLevel || undefined,
          major: values.major,
          semester: values.semester === "" ? undefined : values.semester,
          bio: values.bio,
          wechatHandle: values.wechatHandle,
          whatsappHandle: values.whatsappHandle,
          telegramHandle: values.telegramHandle,
          instagramHandle: values.instagramHandle,
          verifiedStudent: values.verifiedStudent,
          studentVerificationStatus: values.studentVerificationStatus,
          studentVerificationNotes: values.studentVerificationNotes,
          onboardingComplete: values.onboardingComplete,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error ?? "Unable to save.");
        return;
      }

      setMessage("Saved.");
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <Row label="Nickname">
        <Input
          onChange={(event) => set("nickname", event.target.value)}
          value={values.nickname}
        />
      </Row>
      <Row label="Gender">
        <Select onChange={(event) => set("gender", event.target.value as UserGender)} value={values.gender}>
          {USER_GENDER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Row>
      <Row label="Email">
        <Input
          onChange={(event) => set("email", event.target.value)}
          placeholder="name@tum.de (empty to clear)"
          type="email"
          value={values.email}
        />
      </Row>

      <div className="grid grid-cols-2 gap-3">
        <Row label="School">
          <Select
            onChange={(event) => set("school", event.target.value)}
            value={values.school}
          >
            <option value="">—</option>
            {schoolOptions.map((school) => (
              <option key={school.value} value={school.value}>
                {school.shortLabel}
              </option>
            ))}
          </Select>
        </Row>
        <Row label="Degree">
          <Select
            onChange={(event) =>
              set("degreeLevel", event.target.value as AdminUserFormInitialValues["degreeLevel"])
            }
            value={values.degreeLevel}
          >
            <option value="">—</option>
            {DEGREE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {DEGREE_LEVEL_LABELS[level]}
              </option>
            ))}
          </Select>
        </Row>
      </div>

      <div className="grid grid-cols-[2fr_1fr] gap-3">
        <Row label="Major">
          <Input
            onChange={(event) => set("major", event.target.value)}
            value={values.major}
          />
        </Row>
        <Row label="Semester">
          <Select
            onChange={(event) =>
              set(
                "semester",
                event.target.value === "" ? "" : Number(event.target.value),
              )
            }
            value={values.semester === "" ? "" : String(values.semester)}
          >
            <option value="">—</option>
            {semesterChoices.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Row>
      </div>

      <Row label="Bio">
        <Textarea
          onChange={(event) => set("bio", event.target.value)}
          rows={2}
          value={values.bio}
        />
      </Row>

      <Row label="Contact handles">
        <div className="grid grid-cols-2 gap-2">
          <Input
            onChange={(event) => set("wechatHandle", event.target.value)}
            placeholder="WeChat"
            value={values.wechatHandle}
          />
          <Input
            onChange={(event) => set("whatsappHandle", event.target.value)}
            placeholder="WhatsApp"
            value={values.whatsappHandle}
          />
          <Input
            onChange={(event) => set("telegramHandle", event.target.value)}
            placeholder="Telegram"
            value={values.telegramHandle}
          />
          <Input
            onChange={(event) => set("instagramHandle", event.target.value)}
            placeholder="Instagram"
            value={values.instagramHandle}
          />
        </div>
      </Row>

      <div className="space-y-3 rounded-2xl border border-border bg-muted/40 p-3">
        <Row label="Verification status">
          <Select
            onChange={(event) =>
              set(
                "studentVerificationStatus",
                event.target.value as StudentVerificationStatus,
              )
            }
            value={values.studentVerificationStatus}
          >
            {VERIFICATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.toLowerCase().replaceAll("_", " ")}
              </option>
            ))}
          </Select>
        </Row>

        <Checkbox
          checked={values.verifiedStudent}
          label="Verified student (unlocks invitations)"
          onChange={(next) => set("verifiedStudent", next)}
        />

        <Row label="Verification note">
          <Textarea
            onChange={(event) => set("studentVerificationNotes", event.target.value)}
            placeholder="Internal note shown on the profile"
            rows={2}
            value={values.studentVerificationNotes}
          />
        </Row>

        <Checkbox
          checked={values.onboardingComplete}
          label="Onboarding complete"
          onChange={(next) => set("onboardingComplete", next)}
        />
      </div>

      {error ? <p className="text-sm text-[#9b3a3a]">{error}</p> : null}
      {message ? <p className="text-sm text-[#1f5d47]">{message}</p> : null}

      <Button className="w-full" disabled={isPending} onClick={submit} type="button">
        {isPending ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
      onChange={onChange}
      value={value}
    >
      {children}
    </select>
  );
}
