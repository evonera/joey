import { pgTable, text, timestamp, boolean, varchar, uuid, bigint, numeric, integer, jsonb, vector, json, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// --- BetterAuth Required Tables ---
export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("emailVerified").notNull(),
	image: text("image"),
	createdAt: timestamp("createdAt").notNull(),
	updatedAt: timestamp("updatedAt").notNull()
});

export const session = pgTable("session", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expiresAt").notNull(),
	token: text("token").notNull().unique(),
	createdAt: timestamp("createdAt").notNull(),
	updatedAt: timestamp("updatedAt").notNull(),
	ipAddress: text("ipAddress"),
	userAgent: text("userAgent"),
	userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
	activeOrganizationId: text("activeOrganizationId"),
});

export const account = pgTable("account", {
	id: text("id").primaryKey(),
	accountId: text("accountId").notNull(),
	providerId: text("providerId").notNull(),
	userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
	accessToken: text("accessToken"),
	refreshToken: text("refreshToken"),
	idToken: text("idToken"),
	accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
	refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
	scope: text("scope"),
	password: text("password"),
	createdAt: timestamp("createdAt").notNull(),
	updatedAt: timestamp("updatedAt").notNull()
});

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expiresAt").notNull(),
	createdAt: timestamp("createdAt"),
	updatedAt: timestamp("updatedAt")
});

// --- Application Tables ---

export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  subscriptionPlan: varchar("subscription_plan", { length: 50 }).default('free').notNull(),
  subscriptionStatus: varchar("subscription_status", { length: 50 }).default('inactive').notNull(),
  dodoCustomerId: text("dodo_customer_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const member = pgTable("member", {
	id: text("id").primaryKey(),
	organizationId: text("organizationId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
	userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
	role: text("role").notNull(),
	createdAt: timestamp("createdAt").notNull()
});

export const invitation = pgTable("invitation", {
	id: text("id").primaryKey(),
	organizationId: text("organizationId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
	email: text("email").notNull(),
	role: text("role"),
	status: text("status").notNull(),
	expiresAt: timestamp("expiresAt").notNull(),
	inviterId: text("inviterId").notNull().references(() => user.id, { onDelete: "cascade" }),
	createdAt: timestamp("createdAt").notNull()
});

// Multi-tenant relations: most things belong to a tenant
export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 50 }).notNull(), // 'zernio', 'openai', 'anthropic'
  encryptedKey: text("encrypted_key").notNull(),
  status: varchar("status", { length: 50 }).default('active').notNull(), // 'active', 'revoked'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const publicApiTokens = pgTable("public_api_tokens", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull(),
  scopes: text("scopes").array().default(["read", "write"]).notNull(),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tokenHashIdx: uniqueIndex("public_api_tokens_token_hash_idx").on(table.tokenHash),
  tenantIdx: index("public_api_tokens_tenant_id_idx").on(table.tenantId),
}));

export const socialAccounts = pgTable("social_accounts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  platform: varchar("platform", { length: 50 }).notNull(), // 'linkedin', 'facebook', 'x', etc.
  platformAccountId: text("platform_account_id").notNull(), // ID from Zernio
  accountName: text("account_name"),
  avatarUrl: text("avatar_url"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const socialEntities = pgTable("social_entities", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  socialAccountId: text("social_account_id").notNull().references(() => socialAccounts.id, { onDelete: "cascade" }),
  entityType: varchar("entity_type", { length: 50 }).notNull(), // 'page', 'board', 'company_page', 'profile'
  entityId: text("entity_id").notNull(), // platform-specific ID
  entityName: text("entity_name").notNull(),
  avatarUrl: text("avatar_url"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const agentConfigs = pgTable("agent_configs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().unique().references(() => tenants.id, { onDelete: "cascade" }),
  brandVoice: text("brand_voice"),
  postingGoals: text("posting_goals"),
  postingSchedule: jsonb("posting_schedule"), // { cadence: 'daily', timezone: 'America/New_York', times: ['09:00'] }
  nextDraftAt: timestamp("next_draft_at"),
  isPaused: boolean("is_paused").default(false).notNull(),
  pauseReason: text("pause_reason"), // 'budget_exceeded' | 'api_failure' | 'manual'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const drafts = pgTable("drafts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  content: text("content"),
  variants: jsonb("variants"),
  selectedVariantId: text("selected_variant_id"),
  status: varchar("status", { length: 50 }).default('pending_review').notNull(), // 'pending_review', 'approved', 'rejected', 'published', 'failed'
  platformOptions: jsonb("platform_options"), // target platforms/entities and specific configs
  scheduledFor: timestamp("scheduled_for"), // null means publish immediately upon approval
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const posts = pgTable("posts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  draftId: text("draft_id").references(() => drafts.id, { onDelete: "set null" }), // might be created manually
  zernioPostId: text("zernio_post_id"),
  content: text("content").notNull(),
  publishedAt: timestamp("published_at").defaultNow().notNull(),
  status: varchar("status", { length: 50 }).default('published').notNull(),
  metrics: jsonb("metrics"), // views, likes, etc., updated via analytics tool
});

export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  eventId: text("event_id").notNull().unique(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  platform: varchar("platform", { length: 50 }),
  payload: jsonb("payload").notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  processedAt: timestamp("processed_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Durable ledger of proactive automation runs (reminder/webhook/engagement
 * dispatches). Powers the operations run-history view; writes are
 * best-effort and must never fail a dispatch.
 */
export const automationRuns = pgTable("automation_runs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  kind: varchar("kind", { length: 30 }).notNull(), // 'engagement_dispatch' | 'webhook_dispatch' | 'reminder' | 'webhook'
  automationId: text("automation_id").notNull(),
  status: varchar("status", { length: 20 }).default("ok").notNull(), // 'ok' | 'error'
  threadId: text("thread_id"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("automation_runs_tenant_id_idx").on(table.tenantId, table.createdAt.desc()),
  kindIdx: index("automation_runs_kind_automation_idx").on(table.kind, table.automationId),
}));

export const usageTracking = pgTable("usage_tracking", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().unique().references(() => tenants.id, { onDelete: "cascade" }),
  periodStart: timestamp("period_start").notNull(),
  inputTokensUsed: bigint("input_tokens_used", { mode: "number" }).default(0),
  outputTokensUsed: bigint("output_tokens_used", { mode: "number" }).default(0),
  estimatedCostUsd: numeric("estimated_cost_usd", { precision: 10, scale: 4 }).default('0'),
  budgetLimitUsd: numeric("budget_limit_usd", { precision: 10, scale: 4 }),
});

export const assets = pgTable("assets", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  key: text("key").notNull().unique(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  publicUrl: text("public_url").notNull(),
  width: bigint("width", { mode: "number" }),
  height: bigint("height", { mode: "number" }),
  tags: text("tags").array().default([]),
  altText: text("alt_text"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const memories = pgTable("memories", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  metadata: jsonb("metadata"),
  embedding: vector("embedding", { dimensions: 1536 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Exactly one brand guideline per tenant: serializes first-time concurrent
  // syncs (no row exists yet to lock) at the database level. Losers observe a
  // unique violation and skip; see syncTenantBrandGuidelines.
  oneBrandGuidelinePerTenantIdx: uniqueIndex("memories_one_brand_guideline_per_tenant_idx")
    .on(table.tenantId)
    .where(sql`${table.type} = 'brand_guideline'`),
}));

export const tenantMemoryProfiles = pgTable("tenant_memory_profiles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }).unique(),
  staticContext: text("static_context").notNull().default(''),
  dynamicContext: text("dynamic_context").notNull().default(''),
  lastCompactedAt: timestamp("last_compacted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// --- Engagement Tables (Phase 2.7) ---

// --- Threads & Messages (Phase 1.1) ---

export const threads = pgTable("threads", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  subject: text("subject"),
  // optional link to a draft for team discussion around a specific piece of content
  draftId: text("draft_id").references(() => drafts.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("threads_tenant_id_idx").on(table.tenantId, table.updatedAt.desc()),
}));

export const messages = pgTable("messages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  threadId: text("thread_id").notNull().references(() => threads.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  authorUserId: text("author_user_id").references(() => user.id, { onDelete: "set null" }),
  authorRole: varchar("author_role", { length: 50 }).notNull().default("member"), // 'member' | 'agent'
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  threadIdx: index("messages_thread_id_idx").on(table.threadId, table.createdAt),
}));

export const engagementConversations = pgTable("engagement_conversations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  socialAccountId: text("social_account_id").references(() => socialAccounts.id, { onDelete: "set null" }),
  platform: varchar("platform", { length: 50 }).notNull(),
  kind: varchar("kind", { length: 20 }).notNull(), // 'dm' | 'comment' | 'review'
  externalConversationId: text("external_conversation_id").notNull(),
  contactId: text("contact_id"),
  participantId: text("participant_id"),
  participantName: text("participant_name"),
  participantHandle: text("participant_handle"),
  participantAvatar: text("participant_avatar"),
  status: varchar("status", { length: 30 }).notNull().default("active"),
  unreadCount: integer("unread_count").notNull().default(0),
  lastMessagePreview: text("last_message_preview"),
  lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  externalIdx: uniqueIndex("engagement_conversations_external_idx").on(
    table.tenantId,
    table.platform,
    table.kind,
    table.externalConversationId,
  ),
  queueIdx: index("engagement_conversations_queue_idx").on(table.tenantId, table.status, table.lastActivityAt.desc()),
}));

export const engagementActivities = pgTable("engagement_activities", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id").notNull().references(() => engagementConversations.id, { onDelete: "cascade" }),
  platform: varchar("platform", { length: 50 }).notNull(),
  externalActivityId: text("external_activity_id").notNull(),
  eventId: text("event_id"),
  type: varchar("type", { length: 30 }).notNull(), // 'message' | 'comment' | 'mention' | 'review' | 'reaction'
  direction: varchar("direction", { length: 20 }).notNull().default("incoming"),
  body: text("body"),
  actorId: text("actor_id"),
  actorName: text("actor_name"),
  actorHandle: text("actor_handle"),
  actorAvatar: text("actor_avatar"),
  attachments: jsonb("attachments").$type<Array<Record<string, unknown>>>().default([]),
  deliveryStatus: varchar("delivery_status", { length: 30 }),
  isRead: boolean("is_read").notNull().default(false),
  isDeleted: boolean("is_deleted").notNull().default(false),
  occurredAt: timestamp("occurred_at").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  externalIdx: uniqueIndex("engagement_activities_external_idx").on(table.tenantId, table.conversationId, table.externalActivityId),
  timelineIdx: index("engagement_activities_timeline_idx").on(table.tenantId, table.conversationId, table.occurredAt),
}));

export const engagementSyncCursors = pgTable("engagement_sync_cursors", {
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  source: varchar("source", { length: 30 }).notNull(),
  cursor: text("cursor").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantSourceIdx: uniqueIndex("engagement_sync_cursors_tenant_source_idx").on(table.tenantId, table.source),
}));

export const engagementItems = pgTable("engagement_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  socialAccountId: text("social_account_id").references(() => socialAccounts.id, { onDelete: "set null" }),
  conversationId: text("conversation_id").references(() => engagementConversations.id, { onDelete: "cascade" }),
  activityId: text("activity_id").references(() => engagementActivities.id, { onDelete: "cascade" }),
  platform: varchar("platform", { length: 50 }).notNull(),
  platformPostId: text("platform_post_id"),
  platformCommentId: text("platform_comment_id"),
  commenterName: text("commenter_name"),
  commenterHandle: text("commenter_handle"),
  commenterAvatar: text("commenter_avatar"),
  text: text("text").notNull(),
  type: varchar("type", { length: 20 }).notNull().default("comment"), // 'comment' | 'mention'
  status: varchar("status", { length: 50 }).default("pending").notNull(), // 'pending', 'replied', 'skipped'
  dmDispatchStatus: varchar("dm_dispatch_status", { length: 20 }), // 'sending' | 'sent' | 'failed' | 'skipped'
  dmDispatchAttempts: integer("dm_dispatch_attempts").default(0).notNull(),
  dmDispatchLeaseExpiresAt: timestamp("dm_dispatch_lease_expires_at"),
  dmDispatchError: text("dm_dispatch_error"),
  dmDispatchMessageId: text("dm_dispatch_message_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantStatusIdx: index("engagement_items_tenant_status_idx").on(table.tenantId, table.status),
  dmDispatchIdx: index("engagement_items_dm_dispatch_idx").on(
    table.tenantId,
    table.dmDispatchStatus,
    table.dmDispatchLeaseExpiresAt,
  ),
  platformCommentIdx: uniqueIndex("engagement_items_tenant_platform_comment_idx").on(
    table.tenantId,
    table.platform,
    table.platformCommentId,
  ),
}));

export const replyDrafts = pgTable("reply_drafts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  engagementItemId: text("engagement_item_id").notNull().references(() => engagementItems.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  status: varchar("status", { length: 50 }).default("pending_review").notNull(), // 'pending_review', 'approved', 'rejected', 'sent'
  feedback: text("feedback"),
  sentAt: timestamp("sent_at"),
  sendClaimedAt: timestamp("send_claimed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  activeEngagementIdx: uniqueIndex("reply_drafts_active_engagement_idx")
    .on(table.tenantId, table.engagementItemId)
    .where(sql`${table.status} in ('pending_review', 'approved', 'sending', 'failed')`),
}));

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(), // 'draft_ready', 'engagement_reply_needed', 'api_failure', 'publish_success', 'publish_failed'
  title: text("title").notNull(),
  body: text("body").notNull(),
  link: text("link"),
  isRead: boolean("is_read").default(false).notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("notifications_tenant_id_idx").on(table.tenantId, table.isRead, table.createdAt.desc()),
}));

export const notificationPreferences = pgTable("notification_preferences", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }).unique(),
  inAppDraftReady: boolean("in_app_draft_ready").default(true).notNull(),
  inAppEngagementReply: boolean("in_app_engagement_reply").default(true).notNull(),
  inAppApiFailure: boolean("in_app_api_failure").default(true).notNull(),
  inAppPublishSuccess: boolean("in_app_publish_success").default(false).notNull(),
  inAppPublishFailed: boolean("in_app_publish_failed").default(true).notNull(),
  emailDraftReady: boolean("email_draft_ready").default(false).notNull(),
  emailEngagementReply: boolean("email_engagement_reply").default(false).notNull(),
  emailApiFailure: boolean("email_api_failure").default(true).notNull(),
  emailPublishSuccess: boolean("email_publish_success").default(false).notNull(),
  emailPublishFailed: boolean("email_publish_failed").default(true).notNull(),
  emailAddress: text("email_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Flow Builder (Phase 3.3/3.4)
// ---------------------------------------------------------------------------

/**
 * A user-composed automation graph. `graph` holds the full serializable board:
 * { nodes: [{ id, type, config, position }], edges: [{ from, to }], viewport }.
 * Node/edge semantics are validated by src/lib/flows/validation.ts on save.
 */
export const flows = pgTable("flows", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  graph: jsonb("graph").notNull(),
  status: varchar("status", { length: 20 }).default("draft").notNull(), // 'draft' | 'active' | 'paused'
  /** SHA-256 hash of the flow's incoming-webhook secret. */
  webhookSecret: text("webhook_secret"),
  /** Incremented only when status or executable graph semantics change. */
  executionRevision: integer("execution_revision").default(1).notNull(),
  lastRunAt: timestamp("last_run_at"),
  /** Last time the scheduler examined this flow (admitted or skipped). NULL = never examined; NULLS FIRST keeps unticked flows at the admission head. */
  lastTickedAt: timestamp("last_ticked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("flows_tenant_id_idx").on(table.tenantId, table.updatedAt),
}));

/**
 * One execution of a flow. `steps` persists every node's lifecycle + output so
 * runs are debuggable and resumable (restart-from-failed-node in P2):
 * steps: [{ nodeId, type, status, input?, output?, error?, startedAt, finishedAt }]
 */
export const flowRuns = pgTable("flow_runs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  flowId: text("flow_id").notNull().references(() => flows.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 30 }).default("running").notNull(), // 'running' | 'waiting_approval' | 'succeeded' | 'failed'
  trigger: varchar("trigger", { length: 30 }).default("manual").notNull(), // 'manual' | 'schedule' | 'webhook'
  triggerPayload: jsonb("trigger_payload"),
  steps: jsonb("steps").default([]).notNull(),
  approvedNodeIds: jsonb("approved_node_ids").default([]).notNull(),
  fanoutProgress: jsonb("fanout_progress").default({}).notNull(),
  error: text("error"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
}, (table) => ({
  flowIdx: index("flow_runs_flow_id_idx").on(table.flowId, table.startedAt),
  tenantIdx: index("flow_runs_tenant_id_idx").on(table.tenantId),
  runningScheduledIdx: uniqueIndex("flow_runs_running_scheduled_idx")
    .on(table.flowId)
    .where(sql`${table.status} IN ('running','waiting_approval') AND ${table.trigger} = 'schedule'`),
  runningWebhookIdx: uniqueIndex("flow_runs_running_webhook_idx")
    .on(table.flowId, sql`(${table.triggerPayload}->>'id')`)
    .where(sql`${table.status} IN ('running','waiting_approval') AND ${table.trigger} = 'webhook'`),
}));

/** Durable admission record for public per-flow webhook deliveries. */
export const flowWebhookDeliveries = pgTable("flow_webhook_deliveries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  flowId: text("flow_id").notNull().references(() => flows.id, { onDelete: "cascade" }),
  /** Sender-provided idempotency identifier; null means deliberately at-least-once. */
  deliveryId: text("delivery_id"),
  payload: jsonb("payload").notNull(),
  status: varchar("status", { length: 30 }).default("processing").notNull(),
  attempt: integer("attempt").default(1).notNull(),
  error: text("error"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  flowCreatedIdx: index("flow_webhook_deliveries_flow_created_idx").on(table.flowId, table.createdAt),
  explicitDeliveryIdx: uniqueIndex("flow_webhook_deliveries_explicit_idx")
    .on(table.tenantId, table.flowId, table.deliveryId)
    .where(sql`${table.deliveryId} IS NOT NULL`),
}));

/**
 * Installable flow templates (Phase 3.5/3.6 merged into the Flow Builder):
 * official seeds ship with the app; users can publish their own flows here.
 */
export const flowTemplates = pgTable("flow_templates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  slug: varchar("slug", { length: 140 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }).default("general").notNull(),
  graph: jsonb("graph").notNull(),
  isOfficial: boolean("is_official").default(false).notNull(),
  authorTenantId: text("author_tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  installs: integer("installs").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Durable compensation for R2 objects that could not be deleted synchronously. */
export const r2CleanupTasks = pgTable("r2_cleanup_tasks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  runId: text("run_id").references(() => flowRuns.id, { onDelete: "set null" }),
  key: text("key").notNull().unique(),
  reason: text("reason").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  lastError: text("last_error"),
  nextAttemptAt: timestamp("next_attempt_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  dueIdx: index("r2_cleanup_tasks_due_idx").on(table.nextAttemptAt),
}));

export const telegramBotInstallations = pgTable("telegram_bot_installations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }).unique(),
  encryptedToken: text("encrypted_token").notNull(),
  webhookSecretHash: text("webhook_secret_hash").notNull(),
  botTelegramId: bigint("bot_telegram_id", { mode: "number" }).notNull(),
  botUsername: varchar("bot_username", { length: 64 }),
  allowedUserIds: bigint("allowed_user_ids", { mode: "number" }).array().default([]).notNull(),
  status: varchar("status", { length: 30 }).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const telegramUpdates = pgTable("telegram_updates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  installationId: text("installation_id").notNull().references(() => telegramBotInstallations.id, { onDelete: "cascade" }),
  updateId: bigint("update_id", { mode: "number" }).notNull(),
  payload: jsonb("payload").notNull(),
  status: varchar("status", { length: 30 }).default("pending").notNull(),
  error: text("error"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({ installationUpdateIdx: uniqueIndex("telegram_updates_installation_update_idx").on(table.installationId, table.updateId), pendingIdx: index("telegram_updates_pending_idx").on(table.status, table.createdAt) }));

export const telegramOutbox = pgTable("telegram_outbox", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  installationId: text("installation_id").notNull().references(() => telegramBotInstallations.id, { onDelete: "cascade" }),
  idempotencyKey: text("idempotency_key").notNull(),
  chatId: text("chat_id").notNull(),
  text: text("text").notNull(),
  replyMarkup: jsonb("reply_markup"),
  status: varchar("status", { length: 30 }).default("pending").notNull(),
  telegramMessageId: bigint("telegram_message_id", { mode: "number" }),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  sentAt: timestamp("sent_at"),
}, (table) => ({ tenantIdempotencyIdx: uniqueIndex("telegram_outbox_tenant_idempotency_idx").on(table.tenantId, table.idempotencyKey), pendingIdx: index("telegram_outbox_pending_idx").on(table.status, table.createdAt) }));

export const telegramApprovals = pgTable("telegram_approvals", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  installationId: text("installation_id").notNull().references(() => telegramBotInstallations.id, { onDelete: "cascade" }),
  runId: text("run_id").notNull().references(() => flowRuns.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  status: varchar("status", { length: 30 }).default("pending").notNull(),
  decision: boolean("decision"),
  decidedByTelegramUserId: bigint("decided_by_telegram_user_id", { mode: "number" }),
  expiresAt: timestamp("expires_at").notNull(),
  decidedAt: timestamp("decided_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({ pendingIdx: index("telegram_approvals_pending_idx").on(table.status, table.expiresAt), runIdx: index("telegram_approvals_run_idx").on(table.runId), onePendingRunIdx: uniqueIndex("telegram_approvals_one_pending_run_idx").on(table.runId).where(sql`${table.status} = 'pending'`) }));
/**
 * Deployment-wide fixed-window rate limiting for the public API. One row per
 * (token, window) so documented limits hold across instances and restarts.
 */
export const rateLimitCounters = pgTable("rate_limit_counters", {
  tokenId: text("token_id").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").default(1).notNull(),
}, (table) => ({
  tokenWindowIdx: uniqueIndex("rate_limit_token_window_idx").on(table.tokenId, table.windowStart),
}));

// ---------------------------------------------------------------------------
// Theme Studio (Phase TS-1)
// ---------------------------------------------------------------------------

export const themePages = pgTable("theme_pages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  niche: text("niche"),
  audience: text("audience"),
  voice: text("voice"),
  brandKit: jsonb("brand_kit"),
  connectedAccounts: jsonb("connected_accounts").default([]).notNull(),
  defaultRightsPolicy: varchar("default_rights_policy", { length: 30 }).default("strict").notNull(),
  status: varchar("status", { length: 20 }).default("draft").notNull(), // 'draft' | 'active' | 'paused'
  recipeRevision: integer("recipe_revision").default(1).notNull(),
  lastCompiledAt: timestamp("last_compiled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("theme_pages_tenant_id_idx").on(table.tenantId, table.updatedAt.desc()),
}));

export const themeSources = pgTable("theme_sources", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  themePageId: text("theme_page_id").notNull().references(() => themePages.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  sourceType: varchar("source_type", { length: 30 }).notNull(), // 'rss' | 'http' | 'reddit' | 'api'
  url: text("url").notNull(),
  pollIntervalMinutes: integer("poll_interval_minutes").default(60).notNull(),
  freshnessWindowHours: integer("freshness_window_hours").default(24).notNull(),
  geoFilter: text("geo_filter"),
  langFilter: varchar("lang_filter", { length: 10 }),
  rightsCategory: varchar("rights_category", { length: 30 }).default("unknown").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastPolledAt: timestamp("last_polled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  pageIdx: index("theme_sources_page_id_idx").on(table.themePageId),
  tenantIdx: index("theme_sources_tenant_id_idx").on(table.tenantId),
}));

export const themeContentFormats = pgTable("theme_content_formats", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  slug: varchar("slug", { length: 60 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  platform: varchar("platform", { length: 30 }).notNull(),
  mediaType: varchar("media_type", { length: 20 }).notNull(), // 'image' | 'carousel' | 'video'
  aspectRatio: varchar("aspect_ratio", { length: 10 }),
  width: integer("width"),
  height: integer("height"),
  durationRange: jsonb("duration_range"),
  renderer: varchar("renderer", { length: 20 }).notNull(), // 'puppeteer' | 'remotion'
  templateComponentPath: text("template_component_path"),
  defaultPropsSchema: jsonb("default_props_schema"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantSlugIdx: uniqueIndex("theme_content_formats_tenant_slug_idx").on(table.tenantId, table.slug),
}));

export const themeSlots = pgTable("theme_slots", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  themePageId: text("theme_page_id").notNull().references(() => themePages.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  formatId: text("format_id").notNull().references(() => themeContentFormats.id, { onDelete: "restrict" }),
  label: varchar("label", { length: 80 }),
  cadence: varchar("cadence", { length: 20 }).default("daily").notNull(),
  daysOfWeek: jsonb("days_of_week"),
  priority: integer("priority").default(0).notNull(),
  overrideTemplateId: text("override_template_id"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  pageIdx: index("theme_slots_page_id_idx").on(table.themePageId),
  tenantIdx: index("theme_slots_tenant_id_idx").on(table.tenantId),
}));

export const themeVisualTemplates = pgTable("theme_visual_templates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  themePageId: text("theme_page_id").references(() => themePages.id, { onDelete: "set null" }),
  name: varchar("name", { length: 120 }).notNull(),
  formatId: text("format_id").notNull().references(() => themeContentFormats.id, { onDelete: "restrict" }),
  renderer: varchar("renderer", { length: 20 }).notNull(), // 'puppeteer' | 'remotion'
  componentSpec: jsonb("component_spec").notNull(),
  propsSchema: jsonb("props_schema"),
  previewUrl: text("preview_url"),
  version: integer("version").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("theme_visual_templates_tenant_id_idx").on(table.tenantId),
  pageIdx: index("theme_visual_templates_page_id_idx").on(table.themePageId),
}));

export const sourceItems = pgTable("source_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  themePageId: text("theme_page_id").notNull().references(() => themePages.id, { onDelete: "cascade" }),
  sourceId: text("source_id").notNull().references(() => themeSources.id, { onDelete: "cascade" }),
  title: text("title"),
  body: text("body"),
  url: text("url"),
  canonicalUrlHash: text("canonical_url_hash"),
  contentHash: text("content_hash"),
  publishedAt: timestamp("published_at"),
  rightsCategory: varchar("rights_category", { length: 30 }).default("unknown").notNull(),
  metadata: jsonb("metadata"),
  embedding: vector("embedding", { dimensions: 1536 }),
  status: varchar("status", { length: 20 }).default("raw").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  pageIdx: index("source_items_page_id_idx").on(table.themePageId, table.createdAt.desc()),
  tenantIdx: index("source_items_tenant_id_idx").on(table.tenantId),
  canonicalUrlIdx: uniqueIndex("source_items_canonical_url_idx")
    .on(table.themePageId, table.canonicalUrlHash)
    .where(sql`${table.canonicalUrlHash} IS NOT NULL`),
  contentHashIdx: index("source_items_content_hash_idx")
    .on(table.themePageId, table.contentHash),
}));

export const storyClusters = pgTable("story_clusters", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  themePageId: text("theme_page_id").notNull().references(() => themePages.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  summary: text("summary"),
  facts: jsonb("facts").default([]).notNull(),
  memberItemIds: jsonb("member_item_ids").default([]).notNull(),
  embeddingCentroid: vector("embedding_centroid", { dimensions: 1536 }),
  freshnessScore: numeric("freshness_score", { precision: 5, scale: 2 }),
  status: varchar("status", { length: 20 }).default("open").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  pageIdx: index("story_clusters_page_id_idx").on(table.themePageId, table.createdAt.desc()),
  tenantIdx: index("story_clusters_tenant_id_idx").on(table.tenantId),
}));

export const contentPackages = pgTable("content_packages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  themePageId: text("theme_page_id").notNull().references(() => themePages.id, { onDelete: "cascade" }),
  slotId: text("slot_id").references(() => themeSlots.id, { onDelete: "set null" }),
  clusterId: text("cluster_id").references(() => storyClusters.id, { onDelete: "set null" }),
  formatId: text("format_id").notNull().references(() => themeContentFormats.id, { onDelete: "restrict" }),
  templateId: text("template_id").references(() => themeVisualTemplates.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  caption: text("caption"),
  hashtags: text("hashtags").array().default([]),
  renderedAssetUrls: jsonb("rendered_asset_urls").default([]).notNull(),
  provenance: jsonb("provenance").default({}).notNull(),
  status: varchar("status", { length: 30 }).default("pending_review").notNull(),
  scheduledFor: timestamp("scheduled_for"),
  publishedAt: timestamp("published_at"),
  publishedPostId: text("published_post_id"),
  metrics: jsonb("metrics").default({}).notNull(),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  pageStatusIdx: index("content_packages_page_status_idx").on(table.themePageId, table.status, table.createdAt.desc()),
  tenantIdx: index("content_packages_tenant_id_idx").on(table.tenantId),
}));

export const mixRecommendations = pgTable("mix_recommendations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  themePageId: text("theme_page_id").notNull().references(() => themePages.id, { onDelete: "cascade" }),
  formatScores: jsonb("format_scores").default({}).notNull(),
  adjustments: jsonb("adjustments").default([]).notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  acceptedAt: timestamp("accepted_at"),
}, (table) => ({
  tenantIdx: index("mix_recommendations_tenant_id_idx").on(table.tenantId),
  pageIdx: index("mix_recommendations_page_id_idx").on(table.themePageId),
  pendingIdx: index("mix_recommendations_pending_idx").on(table.tenantId, table.themePageId, table.status),
}));

export const dmAutomationRules = pgTable("dm_automation_rules", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  themePageId: text("theme_page_id").notNull().references(() => themePages.id, { onDelete: "cascade" }),
  triggerType: varchar("trigger_type", { length: 20 }).default("keyword").notNull(),
  triggerValue: text("trigger_value").notNull(),
  responseTemplate: text("response_template").notNull(),
  responseLink: text("response_link"),
  isActive: boolean("is_active").default(true).notNull(),
  stats: jsonb("stats").default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  pageIdx: index("dm_automation_rules_page_id_idx").on(table.themePageId),
  tenantIdx: index("dm_automation_rules_tenant_id_idx").on(table.tenantId),
}));

/**
 * Per-item fan-out checkpoints for flow runs: { "<itemIndex>": { nodeId: output } }.
 * Lets restart-from-failed retry only the failed tail of each item's chain
 * instead of re-executing already-successful side-effecting nodes.
 */
export const fanoutProgressCol = {
  fanoutProgress: jsonb("fanout_progress").default({}).notNull(),
};
