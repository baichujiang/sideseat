import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { generateMembershipCode, hashMembershipCode } from "./invite-code";

export const createInviteBatchSchema = z.object({
  requestKey: z.string().uuid(), label: z.string().trim().min(1).max(80),
  mode: z.enum(["SHARED", "INDIVIDUAL"]),
  durationDays: z.number().int().min(1).max(3650),
  quantity: z.number().int().min(1).max(500),
  expiresAt: z.string().datetime({ offset: true }),
}).strict();
export type CreateInviteBatchInput = z.infer<typeof createInviteBatchSchema>;
export type InviteAdmin = { id: string; username: string };
export class InviteAdminError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function createInviteBatch(admin: InviteAdmin, input: CreateInviteBatchInput) {
  const values = createInviteBatchSchema.parse(input);
  const previous = await prisma.membershipInviteBatch.findUnique({ where: { requestKey: values.requestKey } });
  function replay(row: NonNullable<typeof previous>) {
    if (row.createdById !== admin.id || row.label !== values.label || row.mode !== values.mode || row.quantity !== values.quantity || row.durationDays !== values.durationDays || row.expiresAt.toISOString() !== new Date(values.expiresAt).toISOString()) {
      throw new InviteAdminError(409, "请求已使用，请刷新后重试。");
    }
    return { batchId: row.id, codes: [] as Array<{ id: string; code: string }>, alreadyCreated: true };
  }
  if (previous) return replay(previous);
  if (new Date(values.expiresAt) <= new Date()) throw new InviteAdminError(422, "兑换截止时间必须晚于现在。");
  const codes = Array.from({ length: values.mode === "SHARED" ? 1 : values.quantity }, () => generateMembershipCode());
  try {
    return await prisma.$transaction(async tx => {
      const batch = await tx.membershipInviteBatch.create({ data: {
        requestKey: values.requestKey, label: values.label, mode: values.mode, quantity: values.quantity, durationDays: values.durationDays,
        expiresAt: new Date(values.expiresAt), createdById: admin.id, createdByName: admin.username,
        codes: { create: codes.map(code => ({ codeHash: hashMembershipCode(code), label: values.label,
          durationDays: values.durationDays, expiresAt: new Date(values.expiresAt), maxRedemptions: values.mode === "SHARED" ? values.quantity : 1 })) },
        audit: { create: { actorId: admin.id, actorName: admin.username, action: "CREATE_BATCH" } },
      }, include: { codes: { select: { id: true, codeHash: true } } } });
      return { batchId: batch.id, codes: codes.map(code => ({ id: batch.codes.find(row => row.codeHash === hashMembershipCode(code))!.id, code })), alreadyCreated: false };
    });
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      const row = await prisma.membershipInviteBatch.findUnique({ where: { requestKey: values.requestKey } });
      if (row) return replay(row);
    }
    throw cause;
  }
}

export async function listInviteBatches(page = 1) {
  const [rows, total] = await Promise.all([
    prisma.membershipInviteBatch.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20,
      include: { codes: { select: { maxRedemptions: true, redeemedCount: true, disabledAt: true } } } }),
    prisma.membershipInviteBatch.count(),
  ]);
  return { batches: rows.map(({ codes, ...row }) => ({
    id: row.id, label: row.label, mode: row.mode, durationDays: row.durationDays,
    expiresAt: row.expiresAt, disabledAt: row.disabledAt, createdByName: row.createdByName,
    codeCount: codes.length, totalUses: codes.reduce((sum, code) => sum + code.maxRedemptions, 0),
    redeemedCount: codes.reduce((sum, code) => sum + code.redeemedCount, 0),
    remaining: row.expiresAt <= new Date() || row.disabledAt ? 0 : codes.reduce((sum, code) => sum + (code.disabledAt ? 0 : code.maxRedemptions - code.redeemedCount), 0),
  })), total, page, pageSize: 20 };
}

export async function getInviteBatch(batchId: string, view: "codes" | "redemptions" | "audit", page = 1) {
  const batch = await prisma.membershipInviteBatch.findUnique({ where: { id: batchId }, select: { id: true, label: true, disabledAt: true, expiresAt: true } });
  if (!batch) throw new InviteAdminError(404, "找不到该批次。");
  const paging = { skip: (page - 1) * 25, take: 25, orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }] };
  if (view === "codes") {
    const [entries, total] = await Promise.all([
      prisma.membershipInviteCode.findMany({ where: { batchId }, ...paging, select: { id: true, maxRedemptions: true, redeemedCount: true, disabledAt: true, expiresAt: true } }),
      prisma.membershipInviteCode.count({ where: { batchId } }),
    ]);
    return { batch, view, entries, total, page, pageSize: 25 };
  }
  if (view === "redemptions") {
    const where = { code: { batchId } };
    const [entries, total] = await Promise.all([
      prisma.membershipRedemption.findMany({ where, ...paging, select: { id: true, codeId: true, createdAt: true, plusExpiresAt: true, user: { select: { username: true } } } }),
      prisma.membershipRedemption.count({ where }),
    ]);
    return { batch, view, entries, total, page, pageSize: 25 };
  }
  const [entries, total] = await Promise.all([
    prisma.membershipInviteAudit.findMany({ where: { batchId }, ...paging, select: { id: true, actorName: true, action: true, codeId: true, createdAt: true } }),
    prisma.membershipInviteAudit.count({ where: { batchId } }),
  ]);
  return { batch, view, entries, total, page, pageSize: 25 };
}

export async function disableInvite(admin: InviteAdmin, batchId: string, codeId?: string) {
  return prisma.$transaction(async tx => {
    const batch = await tx.membershipInviteBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new InviteAdminError(404, "找不到该批次。");
    const now = new Date();
    if (codeId) {
      const code = await tx.membershipInviteCode.findFirst({ where: { id: codeId, batchId } });
      if (!code) throw new InviteAdminError(404, "找不到该邀请码。");
      const changed = await tx.membershipInviteCode.updateMany({ where: { id: codeId, batchId, disabledAt: null }, data: { disabledAt: now } });
      if (!changed.count) return { disabled: true };
    } else {
      const changed = await tx.membershipInviteBatch.updateMany({ where: { id: batchId, disabledAt: null }, data: { disabledAt: now } });
      if (!changed.count) return { disabled: true };
      await tx.membershipInviteCode.updateMany({ where: { batchId, disabledAt: null }, data: { disabledAt: now } });
    }
    await tx.membershipInviteAudit.create({ data: { batchId, actorId: admin.id, actorName: admin.username, action: codeId ? "DISABLE_CODE" : "DISABLE_BATCH", codeId } });
    return { disabled: true };
  });
}
