import type { DegreeLevel, LanguageProficiency, LanguageTag, UserGender } from "@prisma/client";

import { PresetAvatar } from "@/components/ui/preset-avatar";
import { UserGenderProfileMark } from "@/components/ui/user-gender-icon";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { LANGUAGE_PROFICIENCY_LABEL, LANGUAGE_TAG_LABEL } from "@/lib/constants/languages";
import { DEGREE_LEVEL_LABELS } from "@/lib/constants/majors";
import { getSchoolLabel } from "@/lib/constants/schools";
import { formatSemester } from "@/lib/utils";

export type PeerProfileFields = {
  nickname: string | null;
  gender: UserGender;
  avatarUrl: string | null;
  bio: string | null;
  major: string | null;
  semester: number | null;
  school: string | null;
  degreeLevel: string | null;
  verifiedStudent: boolean;
  studentVerificationStatus:
    | "UNVERIFIED"
    | "EMAIL_PENDING"
    | "VERIFIED"
    | "MANUAL_REVIEW_REQUIRED"
    | "REJECTED";
  languages: Array<{ tag: LanguageTag; proficiency: LanguageProficiency }>;
};

export function PeerProfileView({
  peer,
  metVia,
}: {
  peer: PeerProfileFields;
  metVia: string | null;
}) {
  const name = peer.nickname?.trim() || "Student";

  const degreeLabel =
    peer.degreeLevel != null && peer.degreeLevel in DEGREE_LEVEL_LABELS
      ? DEGREE_LEVEL_LABELS[peer.degreeLevel as DegreeLevel]
      : null;

  const metaLine = [getSchoolLabel(peer.school), peer.major, formatSemester(peer.semester)]
    .filter((s) => s && s !== "Semester not set")
    .join(" · ");

  return (
    <div className="space-y-4 px-1 pb-8 pt-2">
      <section className="overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/30 px-4 py-4">
        <div className="flex items-start gap-4">
          <PresetAvatar id={peer.avatarUrl} size={78} className="shrink-0 ring-2 ring-background/90" />
          <div className="min-w-0 flex-1 pt-0.5">
            <h1 className="flex flex-wrap items-center gap-2 text-[22px] font-semibold tracking-tight">
              <span className="break-words">{name}</span>
              <UserGenderProfileMark gender={peer.gender} iconClassName="h-5 w-5" />
              <VerifiedBadge
                size="sm"
                school={peer.school}
                verifiedStudent={peer.verifiedStudent}
                status={peer.studentVerificationStatus}
              />
            </h1>
            {degreeLabel ? (
              <p className="mt-1 text-sm text-muted-foreground">{degreeLabel}</p>
            ) : null}
            {metaLine ? (
              <p className="mt-1.5 text-xs text-muted-foreground">{metaLine}</p>
            ) : null}
          </div>
        </div>

        {metVia ? (
          <div className="mt-3 inline-flex max-w-full items-center rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
            {metVia}
          </div>
        ) : null}
      </section>

      <section className="space-y-4 text-sm">
        {peer.bio?.trim() ? (
          <div className="rounded-xl border border-border bg-card px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              About
            </p>
            <p className="mt-1.5 leading-relaxed text-foreground/90">{peer.bio.trim()}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-2 text-xs italic text-muted-foreground">
            No tagline yet.
          </div>
        )}

        {peer.languages.length > 0 ? (
          <div className="rounded-xl border border-border bg-card px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Languages
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {peer.languages.map((row) => (
                <span
                  key={row.tag}
                  className="rounded-full bg-foreground/5 px-2.5 py-0.5 text-xs font-medium text-foreground/80"
                  title={LANGUAGE_PROFICIENCY_LABEL[row.proficiency]}
                >
                  {LANGUAGE_TAG_LABEL[row.tag]} · {LANGUAGE_PROFICIENCY_LABEL[row.proficiency]}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
