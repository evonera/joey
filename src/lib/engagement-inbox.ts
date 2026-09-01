import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  engagementActivities,
  engagementConversations,
  engagementItems,
  engagementSyncCursors,
  socialAccounts,
  contentPackages,
} from "@/lib/db/schema";
import type { ZernioWebhookPayload } from "@/lib/webhooks";
import { getZernioClientForTenant } from "@/lib/publisher-core";
import { handleCommentWebhook } from "@/lib/theme-studio/dm-automation/comment-webhook-handler";

type JsonRecord = Record<string, unknown>;
const DM_DISPATCH_LEASE_MS = 2 * 60_000;
const DM_DISPATCH_MAX_ATTEMPTS = 8;

export function themeStudioDmRetryDelayMs(attempt: number): number {
  return Math.min(60 * 60_000, 30_000 * (2 ** Math.min(Math.max(1, attempt), 7)));
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function date(value: unknown, fallback = new Date()): Date {
  if (typeof value !== "string") return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

async function resolveSocialAccount(tenantId: string, account: JsonRecord) {
  const platformAccountId = text(account.accountId) ?? text(account.id);
  if (!platformAccountId) return undefined;
  return db.query.socialAccounts.findFirst({
    where: and(
      eq(socialAccounts.tenantId, tenantId),
      eq(socialAccounts.platformAccountId, platformAccountId),
    ),
    columns: { id: true, platformAccountId: true },
  });
}

type ConversationInput = {
  tenantId: string;
  socialAccountId?: string;
  platform: string;
  kind: "dm" | "comment" | "review";
  externalConversationId: string;
  contactId?: string;
  participantId?: string;
  participantName?: string;
  participantHandle?: string;
  participantAvatar?: string;
  status?: string;
  preview?: string;
  occurredAt: Date;
  metadata?: JsonRecord;
};

async function upsertConversation(input: ConversationInput) {
  const [conversation] = await db.insert(engagementConversations).values({
    tenantId: input.tenantId,
    socialAccountId: input.socialAccountId,
    platform: input.platform,
    kind: input.kind,
    externalConversationId: input.externalConversationId,
    contactId: input.contactId,
    participantId: input.participantId,
    participantName: input.participantName,
    participantHandle: input.participantHandle,
    participantAvatar: input.participantAvatar,
    status: input.status ?? "active",
    lastMessagePreview: input.preview,
    lastActivityAt: input.occurredAt,
    metadata: input.metadata,
  }).onConflictDoUpdate({
    target: [
      engagementConversations.tenantId,
      engagementConversations.platform,
      engagementConversations.kind,
      engagementConversations.externalConversationId,
    ],
    set: {
      socialAccountId: input.socialAccountId,
      contactId: input.contactId,
      participantId: input.participantId,
      participantName: input.participantName,
      participantHandle: input.participantHandle,
      participantAvatar: input.participantAvatar,
      status: input.status ?? "active",
      ...(input.preview !== undefined ? {
        lastMessagePreview: sql`case when ${input.occurredAt} >= ${engagementConversations.lastActivityAt} then ${input.preview} else ${engagementConversations.lastMessagePreview} end`,
      } : {}),
      lastActivityAt: sql`greatest(${engagementConversations.lastActivityAt}, ${input.occurredAt})`,
      metadata: input.metadata,
      updatedAt: new Date(),
    },
  }).returning();
  return conversation;
}

type ActivityInput = {
  tenantId: string;
  conversationId: string;
  platform: string;
  externalActivityId: string;
  eventId?: string;
  type: "message" | "comment" | "mention" | "review" | "reaction";
  direction?: string;
  body?: string;
  actorId?: string;
  actorName?: string;
  actorHandle?: string;
  actorAvatar?: string;
  attachments?: Array<Record<string, unknown>>;
  deliveryStatus?: string;
  isRead?: boolean;
  isDeleted?: boolean;
  occurredAt: Date;
  metadata?: JsonRecord;
};

async function insertActivity(input: ActivityInput) {
  const [activity] = await db.insert(engagementActivities).values({
    ...input,
    direction: input.direction ?? "incoming",
    attachments: input.attachments ?? [],
  }).onConflictDoNothing({
    target: [
      engagementActivities.tenantId,
      engagementActivities.conversationId,
      engagementActivities.externalActivityId,
    ],
  }).returning();
  if (!activity) return undefined;

  if (input.direction !== "outgoing" && !input.isRead) {
    await db.update(engagementConversations)
      .set({ unreadCount: sql`${engagementConversations.unreadCount} + 1`, updatedAt: new Date() })
      .where(and(
        eq(engagementConversations.id, input.conversationId),
        eq(engagementConversations.tenantId, input.tenantId),
      ));
  }
  return activity;
}

async function claimThemeStudioDm(itemId: string, tenantId: string) {
  const now = new Date();
  const [claim] = await db.update(engagementItems).set({
    dmDispatchStatus: "sending",
    dmDispatchAttempts: sql`${engagementItems.dmDispatchAttempts} + 1`,
    dmDispatchLeaseExpiresAt: new Date(now.getTime() + DM_DISPATCH_LEASE_MS),
    dmDispatchError: null,
  }).where(and(
    eq(engagementItems.id, itemId),
    eq(engagementItems.tenantId, tenantId),
    lt(engagementItems.dmDispatchAttempts, DM_DISPATCH_MAX_ATTEMPTS),
    or(
      isNull(engagementItems.dmDispatchStatus),
      and(
        eq(engagementItems.dmDispatchStatus, "failed"),
        or(
          isNull(engagementItems.dmDispatchLeaseExpiresAt),
          lt(engagementItems.dmDispatchLeaseExpiresAt, now),
        ),
      ),
      and(
        eq(engagementItems.dmDispatchStatus, "sending"),
        or(
          isNull(engagementItems.dmDispatchLeaseExpiresAt),
          lt(engagementItems.dmDispatchLeaseExpiresAt, now),
        ),
      ),
    ),
  )).returning({ attempts: engagementItems.dmDispatchAttempts });
  return claim?.attempts ?? null;
}

async function finishThemeStudioDm(
  itemId: string,
  tenantId: string,
  attempt: number,
  result: Awaited<ReturnType<typeof handleCommentWebhook>>,
) {
  const status = result.success
    ? (result.matched ? "sent" : "skipped")
    : (result.retryable === false || attempt >= DM_DISPATCH_MAX_ATTEMPTS ? "skipped" : "failed");
  await db.update(engagementItems).set({
    dmDispatchStatus: status,
    dmDispatchLeaseExpiresAt: status === "failed"
      ? new Date(Date.now() + themeStudioDmRetryDelayMs(attempt))
      : null,
    dmDispatchError: result.success ? null : (result.error || "Private reply failed").slice(0, 1_000),
    dmDispatchMessageId: result.providerMessageId || null,
  }).where(and(
    eq(engagementItems.id, itemId),
    eq(engagementItems.tenantId, tenantId),
    eq(engagementItems.dmDispatchStatus, "sending"),
    eq(engagementItems.dmDispatchAttempts, attempt),
  ));
}

async function dispatchThemeStudioDm(item: typeof engagementItems.$inferSelect): Promise<boolean> {
  if (!item.platformPostId || !item.platformCommentId || !item.socialAccountId) return false;
  const [socialAccount, pkg] = await Promise.all([
    db.query.socialAccounts.findFirst({
      where: and(
        eq(socialAccounts.id, item.socialAccountId),
        eq(socialAccounts.tenantId, item.tenantId),
      ),
      columns: { platformAccountId: true },
    }),
    db.query.contentPackages.findFirst({
      where: and(
        eq(contentPackages.tenantId, item.tenantId),
        eq(contentPackages.publishedPostId, item.platformPostId),
      ),
      columns: { themePageId: true },
    }),
  ]);
  if (!socialAccount?.platformAccountId || !pkg) return false;

  const attempt = await claimThemeStudioDm(item.id, item.tenantId);
  if (attempt === null) return false;
  const raw = record(item.metadata);
  const comment = record(raw.comment);
  const author = record(comment.author);
  let result: Awaited<ReturnType<typeof handleCommentWebhook>>;
  try {
    result = await handleCommentWebhook({
      tenantId: item.tenantId,
      themePageId: pkg.themePageId,
      accountId: socialAccount.platformAccountId,
      platform: item.platform,
      postId: item.platformPostId,
      commentId: item.platformCommentId,
      authorUsername: text(author.username) ?? item.commenterHandle ?? item.commenterName ?? "there",
      authorId: text(author.id) ?? "unknown",
      commentText: text(comment.text) ?? item.text,
    });
  } catch (error) {
    result = {
      matched: true,
      success: false,
      retryable: true,
      error: error instanceof Error ? error.message : "Private reply dispatch failed",
    };
  }
  await finishThemeStudioDm(item.id, item.tenantId, attempt, result);
  if (result.matched && !result.success) {
    console.error("Theme Studio private reply failed", result.error);
  }
  return result.success;
}

/**
 * Consumes due private-reply work independently of webhook redelivery. Claims
 * are tenant-scoped and attempt-fenced, so overlapping minute ticks are safe.
 */
export async function processThemeStudioDmRetries(limit = 25): Promise<{ processed: number }> {
  const now = new Date();
  const candidates = await db.query.engagementItems.findMany({
    where: and(
      lt(engagementItems.dmDispatchAttempts, DM_DISPATCH_MAX_ATTEMPTS),
      or(
        and(
          eq(engagementItems.dmDispatchStatus, "failed"),
          or(
            isNull(engagementItems.dmDispatchLeaseExpiresAt),
            lt(engagementItems.dmDispatchLeaseExpiresAt, now),
          ),
        ),
        and(
          eq(engagementItems.dmDispatchStatus, "sending"),
          or(
            isNull(engagementItems.dmDispatchLeaseExpiresAt),
            lt(engagementItems.dmDispatchLeaseExpiresAt, now),
          ),
        ),
      ),
    ),
    limit: Math.min(Math.max(limit, 1), 100),
  });
  const outcomes = await Promise.allSettled(candidates.map(dispatchThemeStudioDm));
  return {
    processed: outcomes.filter((outcome) => outcome.status === "fulfilled" && outcome.value).length,
  };
}

async function ingestComment(payload: ZernioWebhookPayload, tenantId: string) {
  const raw = payload as JsonRecord;
  const comment = record(raw.comment);
  const author = record(comment.author);
  const account = record(raw.account);
  const platform = text(comment.platform) ?? text(account.platform) ?? "unknown";
  const externalActivityId = text(comment.id) ?? payload.id;
  const externalConversationId = text(comment.platformPostId) ?? text(comment.postId) ?? externalActivityId;
  const occurredAt = date(comment.createdAt, date(payload.timestamp));
  const socialAccount = await resolveSocialAccount(tenantId, account);
  const isOwnAccount = author.isOwnAccount === true;
  const conversation = await upsertConversation({
    tenantId,
    socialAccountId: socialAccount?.id,
    platform,
    kind: "comment",
    externalConversationId,
    participantId: text(author.id),
    participantName: text(author.name),
    participantHandle: text(author.username),
    participantAvatar: text(author.picture),
    preview: text(comment.text) ?? "Attachment",
    occurredAt,
    metadata: raw,
  });
  const isMention = raw.joeyActivityType === "mention";
  const activity = await insertActivity({
    tenantId,
    conversationId: conversation.id,
    platform,
    externalActivityId,
    eventId: payload.id,
    type: isMention ? "mention" : "comment",
    direction: isOwnAccount ? "outgoing" : "incoming",
    body: text(comment.text),
    actorId: text(author.id),
    actorName: text(author.name),
    actorHandle: text(author.username),
    actorAvatar: text(author.picture),
    attachments: comment.attachment ? [record(comment.attachment)] : [],
    occurredAt,
    metadata: raw,
  });
  if (isMention || isOwnAccount) return activity;

  const persistedActivity = activity ?? await db.query.engagementActivities.findFirst({
    where: and(
      eq(engagementActivities.tenantId, tenantId),
      eq(engagementActivities.conversationId, conversation.id),
      eq(engagementActivities.externalActivityId, externalActivityId),
    ),
  });
  if (!persistedActivity) return undefined;

  const [insertedItem] = await db.insert(engagementItems).values({
    tenantId,
    socialAccountId: socialAccount?.id,
    conversationId: conversation.id,
    activityId: persistedActivity.id,
    platform,
    platformPostId: text(comment.postId) ?? text(comment.platformPostId),
    platformCommentId: externalActivityId,
    commenterName: text(author.name),
    commenterHandle: text(author.username),
    commenterAvatar: text(author.picture),
    text: text(comment.text) ?? "[Attachment]",
    type: "comment",
    status: "pending",
    metadata: raw,
    createdAt: occurredAt,
  }).onConflictDoNothing({
    target: [engagementItems.tenantId, engagementItems.platform, engagementItems.platformCommentId],
  }).returning();

  const item = insertedItem ?? await db.query.engagementItems.findFirst({
    where: and(
      eq(engagementItems.tenantId, tenantId),
      eq(engagementItems.platform, platform),
      eq(engagementItems.platformCommentId, externalActivityId),
    ),
  });
  if (!item) return undefined;

  await dispatchThemeStudioDm(item);
  return item;
}

async function ingestMessage(payload: ZernioWebhookPayload, tenantId: string) {
  const raw = payload as JsonRecord;
  const message = record(raw.message);
  const sender = record(message.sender);
  const conversationData = record(raw.conversation);
  const account = record(raw.account);
  const platform = text(message.platform) ?? text(account.platform) ?? "unknown";
  const externalConversationId = text(conversationData.id) ?? text(message.conversationId);
  const externalActivityId = text(message.platformMessageId) ?? text(message.id);
  if (!externalConversationId || !externalActivityId) return undefined;
  const occurredAt = date(message.sentAt, date(raw.statusAt, date(raw.editedAt, date(payload.timestamp))));
  const socialAccount = await resolveSocialAccount(tenantId, account);
  const event = payload.event;
  const direction = text(message.direction) ?? (event === "message.received" ? "incoming" : "outgoing");
  const isMention = record(raw.metadata).isStoryMention === true;
  const conversation = await upsertConversation({
    tenantId,
    socialAccountId: socialAccount?.id,
    platform,
    kind: "dm",
    externalConversationId,
    contactId: text(conversationData.contactId) ?? text(sender.contactId),
    participantId: text(conversationData.participantId) ?? (direction === "incoming" ? text(sender.id) : undefined),
    participantName: text(conversationData.participantName) ?? (direction === "incoming" ? text(sender.name) : undefined),
    participantHandle: text(conversationData.participantUsername) ?? (direction === "incoming" ? text(sender.username) : undefined),
    participantAvatar: text(conversationData.participantPicture) ?? (direction === "incoming" ? text(sender.picture) : undefined),
    status: text(conversationData.status),
    preview: text(message.text) ?? (isMention ? "Story mention" : "Attachment"),
    occurredAt,
    metadata: raw,
  });

  if (["message.delivered", "message.read", "message.failed", "message.edited", "message.deleted"].includes(event)) {
    await db.update(engagementActivities).set({
      body: text(message.text),
      deliveryStatus: event.replace("message.", ""),
      isRead: event === "message.read",
      isDeleted: event === "message.deleted",
      metadata: raw,
      updatedAt: new Date(),
    }).where(and(
      eq(engagementActivities.tenantId, tenantId),
      eq(engagementActivities.conversationId, conversation.id),
      eq(engagementActivities.externalActivityId, externalActivityId),
    ));
    return conversation;
  }

  return insertActivity({
    tenantId,
    conversationId: conversation.id,
    platform,
    externalActivityId,
    eventId: payload.id,
    type: isMention ? "mention" : "message",
    direction,
    body: text(message.text),
    actorId: text(sender.id),
    actorName: text(sender.name),
    actorHandle: text(sender.username),
    actorAvatar: text(sender.picture),
    attachments: Array.isArray(message.attachments) ? message.attachments.map(record) : [],
    deliveryStatus: direction === "outgoing" ? "sent" : undefined,
    isRead: message.isRead === true,
    occurredAt,
    metadata: raw,
  });
}

async function ingestConversationStarted(payload: ZernioWebhookPayload, tenantId: string) {
  const raw = payload as JsonRecord;
  const conversation = record(raw.conversation);
  const account = record(raw.account);
  const platform = text(conversation.platform) ?? text(account.platform) ?? "unknown";
  const externalConversationId = text(conversation.id) ?? text(conversation.platformConversationId);
  if (!externalConversationId) return undefined;
  const socialAccount = await resolveSocialAccount(tenantId, account);
  return upsertConversation({
    tenantId,
    socialAccountId: socialAccount?.id,
    platform,
    kind: "dm",
    externalConversationId,
    contactId: text(conversation.contactId),
    participantId: text(conversation.participantId),
    participantName: text(conversation.participantName),
    participantHandle: text(conversation.participantUsername),
    participantAvatar: text(conversation.participantPicture),
    status: text(conversation.status),
    occurredAt: date(raw.startedAt, date(payload.timestamp)),
    metadata: raw,
  });
}

async function ingestReaction(payload: ZernioWebhookPayload, tenantId: string) {
  const raw = payload as JsonRecord;
  const reaction = record(raw.reaction);
  const sender = record(reaction.sender);
  const conversationData = record(raw.conversation);
  const account = record(raw.account);
  const platform = text(account.platform) ?? "unknown";
  const externalConversationId = text(conversationData.id);
  if (!externalConversationId) return undefined;
  const occurredAt = date(reaction.reactedAt, date(payload.timestamp));
  const socialAccount = await resolveSocialAccount(tenantId, account);
  const conversation = await upsertConversation({
    tenantId,
    socialAccountId: socialAccount?.id,
    platform,
    kind: "dm",
    externalConversationId,
    contactId: text(conversationData.contactId) ?? text(sender.contactId),
    participantId: text(conversationData.participantId) ?? text(sender.id),
    participantName: text(conversationData.participantName) ?? text(sender.name),
    participantHandle: text(conversationData.participantUsername) ?? text(sender.username),
    participantAvatar: text(conversationData.participantPicture) ?? text(sender.picture),
    status: text(conversationData.status),
    preview: `${text(reaction.action) ?? "added"} reaction ${text(reaction.emoji) ?? ""}`.trim(),
    occurredAt,
    metadata: raw,
  });
  return insertActivity({
    tenantId,
    conversationId: conversation.id,
    platform,
    externalActivityId: `reaction:${payload.id}`,
    eventId: payload.id,
    type: "reaction",
    body: text(reaction.emoji),
    actorId: text(sender.id),
    actorName: text(sender.name),
    actorHandle: text(sender.username),
    actorAvatar: text(sender.picture),
    occurredAt,
    metadata: raw,
  });
}

async function ingestReview(payload: ZernioWebhookPayload, tenantId: string) {
  const raw = payload as JsonRecord;
  const review = record(raw.review);
  const reviewer = record(review.reviewer);
  const account = record(raw.account);
  const platform = text(review.platform) ?? text(account.platform) ?? "googlebusiness";
  const externalId = text(review.id);
  if (!externalId) return undefined;
  const occurredAt = date(review.createdAt, date(payload.timestamp));
  const socialAccount = await resolveSocialAccount(tenantId, account);
  const conversation = await upsertConversation({
    tenantId,
    socialAccountId: socialAccount?.id,
    platform,
    kind: "review",
    externalConversationId: externalId,
    participantId: text(reviewer.id),
    participantName: text(reviewer.name),
    participantAvatar: text(reviewer.profileImage),
    status: review.hasReply === true ? "replied" : "active",
    preview: text(review.text) ?? `${String(review.rating ?? "")} star review`,
    occurredAt,
    metadata: raw,
  });
  const activity = await insertActivity({
    tenantId,
    conversationId: conversation.id,
    platform,
    externalActivityId: externalId,
    eventId: payload.id,
    type: "review",
    body: text(review.text),
    actorId: text(reviewer.id),
    actorName: text(reviewer.name),
    actorAvatar: text(reviewer.profileImage),
    isRead: review.hasReply === true,
    occurredAt,
    metadata: raw,
  });
  if (!activity && payload.event === "review.updated") {
    await db.update(engagementActivities).set({
      body: text(review.text),
      actorName: text(reviewer.name),
      actorAvatar: text(reviewer.profileImage),
      isRead: review.hasReply === true,
      metadata: raw,
      updatedAt: new Date(),
    }).where(and(
      eq(engagementActivities.tenantId, tenantId),
      eq(engagementActivities.conversationId, conversation.id),
      eq(engagementActivities.externalActivityId, externalId),
    ));
  }
  if (review.hasReply === true) {
    await db.update(engagementConversations)
      .set({ unreadCount: 0, updatedAt: new Date() })
      .where(and(
        eq(engagementConversations.id, conversation.id),
        eq(engagementConversations.tenantId, tenantId),
      ));
  }
  return activity;
}

export const ZERNIO_ENGAGEMENT_EVENTS = new Set([
  "comment.received",
  "conversation.started",
  "message.received",
  "message.sent",
  "message.edited",
  "message.deleted",
  "message.delivered",
  "message.read",
  "message.failed",
  "reaction.received",
  "review.new",
  "review.updated",
]);

export function engagementEventCategory(event: string): "comment" | "conversation" | "message" | "reaction" | "review" | null {
  if (event === "comment.received") return "comment";
  if (event === "conversation.started") return "conversation";
  if (event.startsWith("message.") && ZERNIO_ENGAGEMENT_EVENTS.has(event)) return "message";
  if (event === "reaction.received") return "reaction";
  if (event === "review.new" || event === "review.updated") return "review";
  return null;
}

export function boundedInboxSyncLimits(limits: { conversations?: number; messagesPerConversation?: number } = {}) {
  return {
    conversations: Math.min(Math.max(limits.conversations ?? 10, 1), 25),
    messagesPerConversation: Math.min(Math.max(limits.messagesPerConversation ?? 50, 1), 100),
  };
}

async function syncCursor(tenantId: string, source: string) {
  return db.query.engagementSyncCursors.findFirst({
    where: and(
      eq(engagementSyncCursors.tenantId, tenantId),
      eq(engagementSyncCursors.source, source),
    ),
    columns: { cursor: true },
  });
}

async function saveSyncCursor(tenantId: string, source: string, cursor?: string | null) {
  if (!cursor) {
    await db.delete(engagementSyncCursors).where(and(
      eq(engagementSyncCursors.tenantId, tenantId),
      eq(engagementSyncCursors.source, source),
    ));
    return;
  }
  await db.insert(engagementSyncCursors).values({ tenantId, source, cursor })
    .onConflictDoUpdate({
      target: [engagementSyncCursors.tenantId, engagementSyncCursors.source],
      set: { cursor, updatedAt: new Date() },
    });
}

export async function ingestZernioEngagementEvent(payload: ZernioWebhookPayload, tenantId: string) {
  const category = engagementEventCategory(payload.event);
  if (category === "comment") return ingestComment(payload, tenantId);
  if (category === "conversation") return ingestConversationStarted(payload, tenantId);
  if (category === "message") return ingestMessage(payload, tenantId);
  if (category === "reaction") return ingestReaction(payload, tenantId);
  if (category === "review") return ingestReview(payload, tenantId);
  return undefined;
}

export async function syncZernioInboxBackfill(
  tenantId: string,
  limits: { conversations?: number; messagesPerConversation?: number } = {},
) {
  const bounded = boundedInboxSyncLimits(limits);
  const conversationLimit = bounded.conversations;
  const messageLimit = bounded.messagesPerConversation;
  const { zernio } = await getZernioClientForTenant(tenantId);
  const [conversationCursor, mentionCursor, reviewCursor] = await Promise.all([
    syncCursor(tenantId, "conversations"),
    syncCursor(tenantId, "mentions"),
    syncCursor(tenantId, "reviews"),
  ]);
  const response = await zernio.messages.listInboxConversations({
    query: { limit: conversationLimit, sortOrder: "desc", cursor: conversationCursor?.cursor },
  });
  if (response.error) throw response.error;

  let conversationsSynced = 0;
  let activitiesSynced = 0;
  let conversationPageComplete = true;
  for (const conversation of response.data?.data ?? []) {
    if (!conversation.id || !conversation.platform || !conversation.accountId) continue;
    await ingestZernioEngagementEvent({
      id: `backfill:conversation:${conversation.platform}:${conversation.id}`,
      event: "conversation.started",
      timestamp: conversation.updatedTime ?? new Date().toISOString(),
      startedAt: conversation.updatedTime ?? new Date().toISOString(),
      account: {
        id: conversation.accountId,
        accountId: conversation.accountId,
        platform: conversation.platform,
        username: conversation.accountUsername ?? "",
      },
      conversation: {
        id: conversation.id,
        platformConversationId: conversation.id,
        platform: conversation.platform,
        participantId: conversation.participantId,
        participantName: conversation.participantName ?? "Unknown",
        participantPicture: conversation.participantPicture ?? undefined,
        status: conversation.status ?? "active",
      },
    }, tenantId);
    conversationsSynced += 1;
    const storedConversation = await db.query.engagementConversations.findFirst({
      where: and(
        eq(engagementConversations.tenantId, tenantId),
        eq(engagementConversations.platform, conversation.platform),
        eq(engagementConversations.kind, "dm"),
        eq(engagementConversations.externalConversationId, conversation.id),
      ),
      columns: { id: true },
    });
    if (!storedConversation) continue;

    const messages = await zernio.messages.getInboxConversationMessages({
      path: { conversationId: conversation.id },
      query: { accountId: conversation.accountId, limit: messageLimit, sortOrder: "desc" },
    });
    if (messages.error) {
      conversationPageComplete = false;
      continue;
    }
    for (const message of messages.data?.messages ?? []) {
      if (!message.id) continue;
      const created = await ingestZernioEngagementEvent({
        id: `backfill:message:${conversation.platform}:${message.id}`,
        event: message.direction === "outgoing" ? "message.sent" : "message.received",
        timestamp: message.createdAt ?? new Date().toISOString(),
        account: {
          id: conversation.accountId,
          accountId: conversation.accountId,
          platform: conversation.platform,
          username: conversation.accountUsername ?? "",
        },
        conversation: {
          id: conversation.id,
          platformConversationId: conversation.id,
          participantId: conversation.participantId,
          participantName: conversation.participantName,
          participantPicture: conversation.participantPicture ?? undefined,
          status: conversation.status ?? "active",
        },
        message: {
          id: message.id,
          conversationId: conversation.id,
          platform: conversation.platform,
          platformMessageId: message.id,
          direction: message.direction ?? "incoming",
          text: message.message ?? null,
          attachments: message.attachments ?? [],
          sender: {
            id: message.senderId ?? conversation.participantId ?? "unknown",
            name: message.senderName ?? undefined,
          },
          sentAt: message.createdAt ?? new Date().toISOString(),
          isRead: true,
        },
        metadata: message.metadata,
      }, tenantId);
      if (created) activitiesSynced += 1;
    }
    await db.update(engagementConversations)
      .set({ unreadCount: Math.max(conversation.unreadCount ?? 0, 0), updatedAt: new Date() })
      .where(and(
        eq(engagementConversations.id, storedConversation.id),
        eq(engagementConversations.tenantId, tenantId),
      ));
  }
  if (conversationPageComplete) {
    await saveSyncCursor(tenantId, "conversations", response.data?.pagination?.nextCursor);
  }

  const mentions = await zernio.mentions.listInboxMentions({
    query: { limit: conversationLimit, sortOrder: "desc", cursor: mentionCursor?.cursor },
  });
  if (!mentions.error) {
    for (const mention of mentions.data?.data ?? []) {
      if (!mention.id || !mention.accountId) continue;
      const created = await ingestZernioEngagementEvent({
        id: `backfill:mention:${mention.id}`,
        event: "comment.received",
        timestamp: mention.publishedAt ?? mention.createdAt ?? new Date().toISOString(),
        joeyActivityType: "mention",
        account: { id: mention.accountId, accountId: mention.accountId, platform: mention.platform ?? "linkedin", username: mention.accountUsername ?? "" },
        comment: {
          id: mention.id,
          postId: null,
          platformPostId: mention.permalink ?? mention.organizationalEntity ?? mention.id,
          platform: mention.platform ?? "linkedin",
          text: mention.content ?? "",
          author: { id: mention.authorUrn ?? "unknown", name: mention.authorName ?? undefined, username: mention.authorUsername ?? undefined, picture: mention.authorPicture ?? undefined },
          createdAt: mention.publishedAt ?? mention.createdAt ?? new Date().toISOString(),
          isReply: false,
          parentCommentId: null,
        },
      }, tenantId);
      if (created) activitiesSynced += 1;
    }
    await saveSyncCursor(tenantId, "mentions", mentions.data?.pagination?.cursor);
  }

  const reviews = await zernio.reviews.listInboxReviews({
    query: { limit: conversationLimit, sortBy: "date", sortOrder: "desc", cursor: reviewCursor?.cursor },
  });
  if (!reviews.error) {
    for (const review of reviews.data?.data ?? []) {
      if (!review.id || !review.accountId || !review.platform) continue;
      const created = await ingestZernioEngagementEvent({
        id: `backfill:review:${review.id}`,
        event: "review.new",
        timestamp: review.created ?? new Date().toISOString(),
        account: { id: review.accountId, accountId: review.accountId, platform: review.platform, username: review.accountUsername ?? "" },
        review: {
          id: review.id,
          platform: review.platform,
          rating: review.rating ?? 0,
          text: review.text ?? "",
          reviewer: { id: review.reviewer?.id ?? null, name: review.reviewer?.name ?? "Unknown", profileImage: review.reviewer?.profileImage ?? null },
          createdAt: review.created ?? new Date().toISOString(),
          hasReply: review.hasReply ?? false,
          reply: review.reply ? { text: review.reply.text ?? "", createdAt: review.reply.created ?? new Date().toISOString() } : undefined,
        },
      }, tenantId);
      if (created) activitiesSynced += 1;
    }
    await saveSyncCursor(tenantId, "reviews", reviews.data?.pagination?.nextCursor);
  }

  return {
    conversationsSynced,
    activitiesSynced,
    hasMore: response.data?.pagination?.hasMore === true || mentions.data?.pagination?.hasMore === true || reviews.data?.pagination?.hasMore === true,
  };
}
