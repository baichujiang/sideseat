import type { ProfileSchoolSummary } from "@/components/profile/profile-identity-sheets";
import { formatMessage } from "@/lib/i18n/messages";

/** One-line school · major/degree · semester for Me preview and profile info header. */
export function buildSchoolSummaryLine(
  summary: ProfileSchoolSummary,
  semesterLabel: string,
): string {
  const majorOrDegree = summary.major.trim() || summary.degreeLabel;
  const sem = formatMessage(semesterLabel, { semester: String(summary.semester) });
  return [summary.schoolShort, majorOrDegree, sem].join(" · ");
}
