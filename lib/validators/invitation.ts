import { ReportReason, ReportStatus } from "@prisma/client";
import { z } from "zod";

// NOTE: The legacy invitation flow (invitationSchema / invitationDecisionSchema)
// was retired when we switched to the first-message model. The `Invitation`
// table and its enums stay in the DB for existing rows and admin read paths.

/** Plain text — used by course-room and group chat APIs. */
export const chatTextMessageSchema = z.object({
  body: z.string().min(1).max(500),
  /** Optional: if present, this message is a reply to the given message in the
   *  same chat. The API validates ownership/visibility before persisting. */
  replyToId: z.string().cuid().optional(),
});

/** @deprecated Use `chatTextMessageSchema`; kept as alias for existing imports. */
export const messageSchema = chatTextMessageSchema;

const directMessageDiscriminated = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("TEXT"),
    body: z.string().trim().min(1).max(500),
    replyToId: z.string().cuid().optional(),
    actionContextId: z.string().min(1).max(128).optional(),
  }),
  z.object({
    type: z.literal("IMAGE"),
    imageUrl: z.string().min(1).max(4_000_000),
    body: z.string().max(500).optional(),
    replyToId: z.string().cuid().optional(),
    actionContextId: z.string().min(1).max(128).optional(),
  }),
  z.object({
    type: z.literal("LOCATION"),
    locationLat: z.number().gte(-90).lte(90),
    locationLng: z.number().gte(-180).lte(180),
    locationName: z.string().max(200).optional().or(z.literal("")),
    body: z.string().max(500).optional(),
    replyToId: z.string().cuid().optional(),
    actionContextId: z.string().min(1).max(128).optional(),
  }),
]);

/**
 * 1:1 connection chat — text, shared image (URL from our upload endpoint), or location pin.
 * Legacy clients omit `type`; they are treated as TEXT.
 */
export const directMessageSchema = z.preprocess((raw: unknown) => {
  if (raw && typeof raw === "object" && raw !== null && !("type" in raw) && "body" in raw) {
    return { ...raw, type: "TEXT" as const };
  }
  return raw;
}, directMessageDiscriminated);

export type DirectMessageInput = z.infer<typeof directMessageDiscriminated>;

/**
 * First-message flow: start a 1:1 conversation by sending one message. The
 * receiver side does NOT have to approve — the thread opens for both sides as
 * soon as the message is persisted. `courseId` is optional context so we can
 * render "Connected via {course}" on profiles when the sender came from a
 * course-scoped surface (member list, classmate profile, Discover).
 */
export const startConversationSchema = z.object({
  peerId: z.string().cuid(),
  body: z.string().min(1).max(500),
  courseId: z.string().cuid().optional(),
});

/** Open a direct thread without sending the first message yet. */
export const openConversationSchema = z.object({
  peerId: z.string().cuid(),
  courseId: z.string().cuid().optional(),
  postId: z.string().cuid().optional(),
});

export const contactExchangeSchema = z.object({
  action: z.enum(["request", "accept", "decline"]),
});

export const endConnectionSchema = z.object({
  reason: z.string().max(240).optional().or(z.literal("")),
});

export const blockSchema = z.object({
  blockedId: z.string().cuid(),
  connectionId: z.string().cuid().optional(),
  reason: z.string().max(240).optional().or(z.literal("")),
});

export const reportSchema = z.object({
  reportedUserId: z.string().cuid(),
  connectionId: z.string().cuid().optional(),
  invitationId: z.string().cuid().optional(),
  /** Report targets a specific 1:1 message; mutually exclusive with
   *  `courseRoomMessageId`. The API verifies the reporter can see the message
   *  before storing the pointer. */
  messageId: z.string().cuid().optional(),
  /** Report targets a specific course-room message. */
  courseRoomMessageId: z.string().cuid().optional(),
  /** Report targets a specific multi-person group-chat message. */
  groupChatMessageId: z.string().cuid().optional(),
  /** Report targets a specific Discover buddy post. */
  classmatePostId: z.string().cuid().optional(),
  /** Report targets a public question or host answer under a buddy post. */
  classmatePostCommentId: z.string().cuid().optional(),
  /** Report targets a public message or organizer reply under an activity. */
  discoverActivityCommentId: z.string().cuid().optional(),
  reason: z.nativeEnum(ReportReason),
  details: z.string().max(500).optional().or(z.literal("")),
});

export const adminReportSchema = z.object({
  status: z.nativeEnum(ReportStatus),
  adminNotes: z.string().max(1000).optional().or(z.literal("")),
});
