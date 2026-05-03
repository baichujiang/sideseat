import {
  ConnectionStatus,
  StudySessionProposalStatus,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { safeReturnPath } from "@/lib/nav/back";
import { materializeCalendarEntries } from "@/lib/queries/study-sessions";
import {
  counterProposalSchema,
  proposalActionSchema,
} from "@/lib/validators/study-session";

/**
 * Proposal lifecycle endpoint. Accepts both JSON and form posts because
 * the card's buttons are server-style forms (`method="post"`) for progressive
 * enhancement, while the composer sheet uses JSON.
 *
 * Actions:
 *  - accept   (recipient only)  → status=ACCEPTED, materialize CalendarEntries
 *  - decline  (recipient only)  → status=DECLINED
 *  - cancel   (proposer only)   → status=CANCELED
 *  - counter  (recipient only)  → creates a NEW proposal with counterOfId set
 *                                 and marks this one SUPERSEDED; the new
 *                                 proposal starts as PROPOSED from the other
 *                                 side's perspective.
 *
 * State guards: every transition is only valid while the proposal is
 * currently PROPOSED. We also reject if `startAt` has already passed — the
 * UI treats those as EXPIRED without a DB write, but the server is the
 * source of truth.
 */
export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ connectionId: string; proposalId: string }>;
  },
) {
  try {
    const user = await requireOnboardedUser();
    const { connectionId, proposalId } = await params;
    const contentType = request.headers.get("content-type") ?? "";
    const isForm = !contentType.includes("application/json");
    const formData = isForm ? await request.formData() : null;
    const rawAction = isForm ? formData!.get("action") : null;
    const returnTo =
      (formData?.get("returnTo") as string | null) ?? `/connections/${connectionId}`;

    // Load with enough context to authorize and run the transition.
    const proposal = await prisma.studySessionProposal.findFirst({
      where: {
        id: proposalId,
        connectionId,
        connection: {
          status: ConnectionStatus.ACTIVE,
          OR: [{ userAId: user.id }, { userBId: user.id }],
        },
      },
      include: {
        connection: {
          include: { userA: true, userB: true },
        },
      },
    });

    if (!proposal || !proposal.connection) {
      return error("Proposal not found.", 404);
    }

    const { connection } = proposal;
    const isProposer = proposal.proposerId === user.id;
    const stillOpen = proposal.status === StudySessionProposalStatus.PROPOSED;
    const notYetStarted = proposal.startAt.getTime() > Date.now();

    // COUNTER: recipient posts a fresh time window; the old proposal moves to
    // SUPERSEDED and a new one is created with counterOfId set.
    if (rawAction === "counter" || (!isForm && (await peekCounter(request)))) {
      if (isProposer) return error("Only the recipient can counter.", 403);
      if (!stillOpen || !notYetStarted) {
        return error("This proposal can no longer be countered.", 409);
      }
      const values = isForm
        ? counterProposalSchema.parse({
            startAt: formData!.get("startAt"),
            endAt: formData!.get("endAt"),
            activityType: formData!.get("activityType"),
            location: formData!.get("location") || "",
            note: formData!.get("note") || "",
          })
        : await parseJson(request, counterProposalSchema);

      const newProposal = await prisma.$transaction(async (tx) => {
        await tx.studySessionProposal.update({
          where: { id: proposal.id },
          data: { status: StudySessionProposalStatus.SUPERSEDED },
        });
        return tx.studySessionProposal.create({
          data: {
            proposerId: user.id,
            connectionId,
            counterOfId: proposal.id,
            activityType: values.activityType,
            startAt: values.startAt,
            endAt: values.endAt,
            location: values.location ? values.location : null,
            note: values.note ? values.note : null,
          },
        });
      });

      if (isForm) {
        return NextResponse.redirect(
          new URL(safeReturnPath(returnTo, `/connections/${connectionId}`), request.url),
        );
      }
      return ok(newProposal, { status: 201 });
    }

    // Remaining actions are param-less.
    const parsed = isForm
      ? proposalActionSchema.parse({ action: rawAction })
      : proposalActionSchema.parse(await request.clone().json());

    if (!stillOpen) return error("Proposal is no longer open.", 409);
    if (!notYetStarted)
      return error("Proposal start time has already passed.", 409);

    if (parsed.action === "accept") {
      if (isProposer) return error("Only the recipient can accept.", 403);
      await prisma.$transaction(async (tx) => {
        await tx.studySessionProposal.update({
          where: { id: proposal.id },
          data: { status: StudySessionProposalStatus.ACCEPTED },
        });
        await materializeCalendarEntries(tx, {
          proposalId: proposal.id,
          activityType: proposal.activityType,
          startAt: proposal.startAt,
          endAt: proposal.endAt,
          location: proposal.location ?? null,
          userAId: connection.userAId,
          userBId: connection.userBId,
          userANickname: connection.userA.nickname,
          userBNickname: connection.userB.nickname,
        });
      });
    } else if (parsed.action === "decline") {
      if (isProposer) return error("Only the recipient can decline.", 403);
      await prisma.studySessionProposal.update({
        where: { id: proposal.id },
        data: { status: StudySessionProposalStatus.DECLINED },
      });
    } else if (parsed.action === "cancel") {
      if (!isProposer) return error("Only the proposer can cancel.", 403);
      await prisma.studySessionProposal.update({
        where: { id: proposal.id },
        data: { status: StudySessionProposalStatus.CANCELED },
      });
    }

    if (isForm) {
      return NextResponse.redirect(
        new URL(safeReturnPath(returnTo, `/connections/${connectionId}`), request.url),
      );
    }
    return ok({ status: "ok" });
  } catch (cause) {
    console.error(cause);
    return error("Unable to update proposal.");
  }
}

async function peekCounter(request: Request): Promise<boolean> {
  try {
    const body = await request.clone().json();
    return body && body.action === "counter";
  } catch {
    return false;
  }
}
