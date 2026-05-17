import type { ScheduleShareGuestProposalStatus } from "@prisma/client";

/** Proposal state returned to the signed-in viewer on a public share link. */
export type ViewerScheduleShareProposal = {
  id: string;
  title: string;
  note: string | null;
  location: string | null;
  startTime: string;
  endTime: string;
  status: Extract<ScheduleShareGuestProposalStatus, "PENDING" | "ACCEPTED">;
};

export function serializeViewerProposal(row: {
  id: string;
  title: string;
  note: string | null;
  location: string | null;
  startTime: Date;
  endTime: Date;
  status: ScheduleShareGuestProposalStatus;
}): ViewerScheduleShareProposal | null {
  if (row.status !== "PENDING" && row.status !== "ACCEPTED") {
    return null;
  }
  return {
    id: row.id,
    title: row.title,
    note: row.note,
    location: row.location,
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    status: row.status,
  };
}
