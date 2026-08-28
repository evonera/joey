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
});

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
});

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

export const engagementItems = pgTable("engagement_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  platform: varchar("platform", { length: 50 }).notNull(),
  platformPostId: text("platform_post_id"),
  platformCommentId: text("platform_comment_id"),
  commenterName: text("commenter_name"),
  commenterHandle: text("commenter_handle"),
  commenterAvatar: text("commenter_avatar"),
  text: text("text").notNull(),
  type: varchar("type", { length: 20 }).notNull().default("comment"), // 'comment' | 'mention'
  status: varchar("status", { length: 50 }).default("pending").notNull(), // 'pending', 'replied', 'skipped'
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantStatusIdx: index("engagement_items_tenant_status_idx").on(table.tenantId, table.status),
  platformCommentIdx: uniqueIndex("engagement_items_platform_comment_idx").on(table.platformCommentId),
}));

export const replyDrafts = pgTable("reply_drafts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  engagementItemId: text("engagement_item_id").notNull().references(() => engagementItems.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  status: varchar("status", { length: 50 }).default("pending_review").notNull(), // 'pending_review', 'approved', 'rejected', 'sent'
  feedback: text("feedback"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
  lastRunAt: timestamp("last_run_at"),
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

/**
 * Per-item fan-out checkpoints for flow runs: { "<itemIndex>": { nodeId: output } }.
 * Lets restart-from-failed retry only the failed tail of each item's chain
 * instead of re-executing already-successful side-effecting nodes.
 */
export const fanoutProgressCol = {
  fanoutProgress: jsonb("fanout_progress").default({}).notNull(),
};
