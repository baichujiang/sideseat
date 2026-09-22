import { revalidatePath } from "next/cache";

import { SectionHeader } from "@/components/layout/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAdminUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { socialGroupDraftSchema } from "@/lib/validators/social-group";
import {
  approveSmallGroupOpportunity,
  createSmallGroupDraft,
} from "@/lib/v2/social-groups";

const PAGE_PATH = "/admin/social-groups";

function iso(formData: FormData, key: string) {
  return new Date(String(formData.get(key) ?? "")).toISOString();
}

async function createDraft(formData: FormData) {
  "use server";
  const admin = await requireAdminUser();
  const input = socialGroupDraftSchema.parse({
    topic: String(formData.get("topic") ?? "STUDY"),
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    school: String(formData.get("school") ?? "TUM"),
    city: String(formData.get("city") ?? "Munich"),
    startAt: iso(formData, "startAt"),
    endAt: iso(formData, "endAt"),
    responseDeadline: iso(formData, "responseDeadline"),
    location: String(formData.get("location") ?? ""),
    minimumMembers: 3,
    maximumMembers: 5,
  });
  await createSmallGroupDraft({ adminUserId: admin.id, input });
  revalidatePath(PAGE_PATH);
}

async function approveDraft(formData: FormData) {
  "use server";
  const admin = await requireAdminUser();
  await approveSmallGroupOpportunity({
    adminUserId: admin.id,
    opportunityId: String(formData.get("opportunityId")),
    candidateUserIds: formData.getAll("candidateUserIds").map(String),
  });
  revalidatePath(PAGE_PATH);
}

async function cancelOpportunity(formData: FormData) {
  "use server";
  await requireAdminUser();
  await prisma.socialGroupOpportunity.updateMany({
    where: {
      id: String(formData.get("opportunityId")),
      status: { in: ["DRAFT", "ACTIVE"] },
    },
    data: { status: "CANCELED" },
  });
  revalidatePath(PAGE_PATH);
}

function localInputValue(date: Date) {
  return date.toISOString().slice(0, 16);
}

export default async function AdminSocialGroupsPage() {
  await requireAdminUser();
  const opportunities = await prisma.socialGroupOpportunity.findMany({
    include: {
      candidates: {
        include: {
          user: { select: { id: true, username: true, nickname: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const now = Date.now();
  const start = new Date(now + 4 * 24 * 60 * 60 * 1_000);
  const end = new Date(start.getTime() + 90 * 60 * 1_000);
  const deadline = new Date(start.getTime() - 24 * 60 * 60 * 1_000);

  return (
    <div className="space-y-6 pb-12">
      <SectionHeader
        title="Small Group pilot"
        description="Rule-generated candidates stay private until an admin approves the opportunity and at least three users confirm. Times below are UTC."
      />

      <form action={createDraft} className="grid gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-2">
        <label className="grid gap-1 text-xs text-muted-foreground">
          Topic
          <select className="h-10 rounded-xl border bg-background px-3 text-sm text-foreground" name="topic">
            {['COFFEE', 'STUDY', 'SPORTS', 'EXPLORE', 'FOOD', 'EVENTS'].map((topic) => (
              <option key={topic}>{topic}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Title
          <input className="h-10 rounded-xl border bg-background px-3 text-sm text-foreground" name="title" required />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          School
          <input className="h-10 rounded-xl border bg-background px-3 text-sm text-foreground" defaultValue="TUM" name="school" required />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          City
          <input className="h-10 rounded-xl border bg-background px-3 text-sm text-foreground" defaultValue="Munich" name="city" required />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Starts (UTC)
          <input className="h-10 rounded-xl border bg-background px-3 text-sm text-foreground" defaultValue={localInputValue(start)} name="startAt" type="datetime-local" required />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Ends (UTC)
          <input className="h-10 rounded-xl border bg-background px-3 text-sm text-foreground" defaultValue={localInputValue(end)} name="endAt" type="datetime-local" required />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Response deadline (UTC)
          <input className="h-10 rounded-xl border bg-background px-3 text-sm text-foreground" defaultValue={localInputValue(deadline)} name="responseDeadline" type="datetime-local" required />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Location
          <input className="h-10 rounded-xl border bg-background px-3 text-sm text-foreground" name="location" />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground md:col-span-2">
          Internal description
          <textarea className="min-h-20 rounded-xl border bg-background p-3 text-sm text-foreground" name="description" />
        </label>
        <button className="h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background md:col-span-2" type="submit">
          Generate reviewed draft
        </button>
      </form>

      {opportunities.length === 0 ? (
        <EmptyState title="No pilot opportunities yet" />
      ) : (
        <div className="space-y-4">
          {opportunities.map((opportunity) => (
            <article className="rounded-2xl border border-border bg-card p-4" key={opportunity.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-foreground">{opportunity.title}</h2>
                  <p className="text-xs text-muted-foreground">
                    {opportunity.topic} · {opportunity.school} · {opportunity.city} · {opportunity.startAt.toISOString()}
                  </p>
                </div>
                <StatusBadge tone={opportunity.status === 'CONFIRMED' ? 'calm' : 'neutral'}>
                  {opportunity.status}
                </StatusBadge>
              </div>

              <div className="mt-4 space-y-2">
                {opportunity.candidates.map((candidate) => (
                  <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2 text-sm" key={candidate.id}>
                    <span>
                      {candidate.user.nickname?.trim() || candidate.user.username}
                      <span className="ml-2 text-xs text-muted-foreground">{candidate.reasonCodes.join(' · ')}</span>
                    </span>
                    <StatusBadge tone="neutral">{candidate.status}</StatusBadge>
                  </div>
                ))}
              </div>

              {opportunity.status === 'DRAFT' ? (
                <form action={approveDraft} className="mt-4 space-y-3">
                  <input name="opportunityId" type="hidden" value={opportunity.id} />
                  <fieldset className="grid gap-2 sm:grid-cols-2">
                    <legend className="mb-2 text-xs font-semibold text-muted-foreground">Approve 3–5 candidates</legend>
                    {opportunity.candidates.map((candidate) => (
                      <label className="flex items-center gap-2 text-sm" key={candidate.id}>
                        <input defaultChecked name="candidateUserIds" type="checkbox" value={candidate.userId} />
                        {candidate.user.nickname?.trim() || candidate.user.username}
                      </label>
                    ))}
                  </fieldset>
                  <button className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground" type="submit">
                    Approve and invite
                  </button>
                </form>
              ) : null}

              {opportunity.status === 'DRAFT' || opportunity.status === 'ACTIVE' ? (
                <form action={cancelOpportunity} className="mt-3">
                  <input name="opportunityId" type="hidden" value={opportunity.id} />
                  <button className="text-sm font-medium text-destructive" type="submit">Cancel opportunity</button>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
