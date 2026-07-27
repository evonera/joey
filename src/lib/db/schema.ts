import { pgTable, text, timestamp, boolean, varchar, uuid, bigint, numeric, jsonb } from 'drizzle-orm/pg-core';
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
	userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" })
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
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Multi-tenant relations: most things belong to a tenant
export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 50 }).notNull(), // 'zernio', 'openai', 'anthropic'
  encryptedKey: text("encrypted_key").notNull(),
  status: varchar("status", { length: 50 }).default('active').notNull(), // 'active', 'revoked'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const socialAccounts = pgTable("social_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  platform: varchar("platform", { length: 50 }).notNull(), // 'linkedin', 'facebook', 'x', etc.
  platformAccountId: text("platform_account_id").notNull(), // ID from Zernio
  accountName: text("account_name"),
  avatarUrl: text("avatar_url"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const socialEntities = pgTable("social_entities", {
  id: uuid("id").primaryKey().defaultRandom(),
  socialAccountId: uuid("social_account_id").notNull().references(() => socialAccounts.id, { onDelete: "cascade" }),
  entityType: varchar("entity_type", { length: 50 }).notNull(), // 'page', 'board', 'company_page', 'profile'
  entityId: text("entity_id").notNull(), // platform-specific ID
  entityName: text("entity_name").notNull(),
  avatarUrl: text("avatar_url"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const agentConfigs = pgTable("agent_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().unique().references(() => tenants.id, { onDelete: "cascade" }),
  brandVoice: text("brand_voice"),
  postingGoals: text("posting_goals"),
  postingSchedule: jsonb("posting_schedule"), // { cadence: 'daily', timezone: 'America/New_York', times: ['09:00'] }
  nextDraftAt: timestamp("next_draft_at"),
  isPaused: boolean("is_paused").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const drafts = pgTable("drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  status: varchar("status", { length: 50 }).default('pending_review').notNull(), // 'pending_review', 'approved', 'rejected', 'published', 'failed'
  platformOptions: jsonb("platform_options"), // target platforms/entities and specific configs
  scheduledFor: timestamp("scheduled_for"), // null means publish immediately upon approval
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  draftId: uuid("draft_id").references(() => drafts.id, { onDelete: "set null" }), // might be created manually
  zernioPostId: text("zernio_post_id"),
  content: text("content").notNull(),
  publishedAt: timestamp("published_at").defaultNow().notNull(),
  status: varchar("status", { length: 50 }).default('published').notNull(),
  metrics: jsonb("metrics"), // views, likes, etc., updated via analytics tool
});

export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
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
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  periodStart: timestamp("period_start").notNull(),
  inputTokensUsed: bigint("input_tokens_used", { mode: "number" }).default(0),
  outputTokensUsed: bigint("output_tokens_used", { mode: "number" }).default(0),
  estimatedCostUsd: numeric("estimated_cost_usd", { precision: 10, scale: 4 }).default('0'),
  budgetLimitUsd: numeric("budget_limit_usd", { precision: 10, scale: 4 }), // null = unlimited (e.g. BYOK)
});
