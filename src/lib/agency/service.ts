import { randomUUID } from "node:crypto";
import { and, eq, desc, inArray, sql, count, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { customAgents, customAgentAccounts, customAgentVersions, customAgentRuns, customAgentThreads, member, scouts, themePages, socialAccounts, contentPackages } from "@/lib/db/schema";
import { agentConfigSchema, assertAgentSessionAccess, canOperateAgency, type AgencyActor, type AgencyConfig } from "./config";

export type AgencyDb = Pick<typeof db, "query" | "select" | "insert" | "delete" | "update" | "execute">;
export async function requireAgencyMember(actor: AgencyActor, connection: AgencyDb = db) {
  const membership = await connection.query.member.findFirst({ where: and(eq(member.organizationId, actor.tenantId), eq(member.userId, actor.userId)) });
  if (!membership || !["member", "admin", "owner"].includes(membership.role)) throw new Error("Workspace access denied.");
  return membership;
}
export async function lockAgency(connection: AgencyDb, scope: string) {
  await connection.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`agency:${scope}`}))`);
}
export async function validateAgencyBindings(connection: AgencyDb, tenantId: string, config: AgencyConfig) {
  const accounts = config.accountIds.length ? await connection.query.socialAccounts.findMany({
    where: and(eq(socialAccounts.tenantId, tenantId), eq(socialAccounts.isActive, true), inArray(socialAccounts.id, config.accountIds)),
  }) : [];
  if (accounts.length !== config.accountIds.length) throw new Error("Choose active destination accounts from this workspace.");
  if (config.themePageId) {
    const page = await connection.query.themePages.findFirst({ where: and(eq(themePages.tenantId, tenantId), eq(themePages.id, config.themePageId)) });
    if (!page) throw new Error("Theme Page not found in this workspace.");
    const linked = Array.isArray(page.connectedAccounts) ? page.connectedAccounts as string[] : [];
    if (config.scoutId && config.accountIds.some(id => !linked.includes(id))) throw new Error("Bind the destination accounts to this Theme Page first.");
  }
  if (config.scoutId) {
    const scout = await connection.query.scouts.findFirst({ where: and(eq(scouts.tenantId, tenantId), eq(scouts.id, config.scoutId)) });
    if (!scout || scout.platform !== "instagram") throw new Error("Choose an Instagram Scout from this workspace.");
    // A source monitored by both the legacy scheduler and this agent would be
    // polled twice. Activation of this path does not activate the Scout itself.
    if (scout.isActive) throw new Error("Pause the Scout's standalone schedule before assigning it to an agent.");
    if (accounts.some(account => account.platform !== "instagram")) throw new Error("Instagram Scout agents require Instagram destination accounts.");
  }
}
async function snapshot(connection: AgencyDb, actor: AgencyActor, agentId: string, version: number, config: AgencyConfig) {
  await connection.insert(customAgentVersions).values({ tenantId: actor.tenantId, agentId, version, config, createdBy: actor.userId });
  await connection.delete(customAgentAccounts).where(and(eq(customAgentAccounts.tenantId, actor.tenantId), eq(customAgentAccounts.agentId, agentId)));
  if (config.accountIds.length) await connection.insert(customAgentAccounts).values(config.accountIds.map(accountId => ({ tenantId: actor.tenantId, agentId, accountId })));
}

/** Run inside the same transaction as resource deletion. Revoking a binding
 * pauses its agent and invalidates old sessions/work before the FK is removed. */
export async function detachAgencyResource(connection: AgencyDb, actor: AgencyActor, resource: { kind: "scout" | "page"; id: string }) {
  await lockAgency(connection, actor.tenantId);
  const membership = await requireAgencyMember(actor, connection);
  const column = resource.kind === "scout" ? customAgents.scoutId : customAgents.themePageId;
  const bound = await connection.query.customAgents.findMany({ where: and(eq(customAgents.tenantId, actor.tenantId), eq(column, resource.id)), limit: 20 });
  if (bound.some(agent => agent.state === "active") && !canOperateAgency(membership.role)) throw new Error("Only workspace admins can remove a source bound to an active agent.");
  for (const agent of bound) {
    const accounts = await connection.query.customAgentAccounts.findMany({ where: and(eq(customAgentAccounts.tenantId, actor.tenantId), eq(customAgentAccounts.agentId, agent.id)), limit: 15 });
    const config = agentConfigSchema.parse({ name: agent.name, description: agent.description, specialty: agent.specialty === "scout" ? "writer" : agent.specialty, avatarShape: agent.avatarShape, avatarColor: agent.avatarColor, dailyDraftLimit: agent.dailyDraftLimit, scoutId: null, themePageId: resource.kind === "page" ? null : agent.themePageId, accountIds: accounts.map(binding => binding.accountId) });
    const { accountIds: _accounts, ...values } = config;
    await connection.update(customAgents).set({ ...values, state: agent.state === "archived" ? "archived" : "paused", configVersion: agent.configVersion + 1, approvedVersion: null, approvedBy: null, updatedAt: new Date() }).where(and(eq(customAgents.id, agent.id), eq(customAgents.tenantId, actor.tenantId)));
    await connection.update(customAgentRuns).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(customAgentRuns.tenantId, actor.tenantId), eq(customAgentRuns.agentId, agent.id), eq(customAgentRuns.status, "running")));
    await snapshot(connection, actor, agent.id, agent.configVersion + 1, config);
  }
}

async function settleExpiredAgencyRuns(connection: AgencyDb, tenantId: string, agentId: string) {
  await connection.update(customAgentRuns).set({ status: "failed", error: "Run lease expired. Retry is limited to three attempts.", updatedAt: new Date() }).where(and(eq(customAgentRuns.tenantId, tenantId), eq(customAgentRuns.agentId, agentId), eq(customAgentRuns.status, "running"), sql`${customAgentRuns.leaseExpiresAt} <= now()`));
}

/** Source settings are part of execution authority even when the standalone
 * Scout is paused. Serialize source edits against activation and draft commit. */
export async function guardAgencyScoutChange(connection: AgencyDb, actor: AgencyActor, scoutId: string, activate = false) {
  await lockAgency(connection, actor.tenantId);
  await requireAgencyMember(actor, connection);
  const bound = await connection.query.customAgents.findMany({ where: and(eq(customAgents.tenantId, actor.tenantId), eq(customAgents.scoutId, scoutId)), limit: 20 });
  if (activate && bound.some(agent => agent.state !== "archived")) throw new Error("Unbind this Scout from its agent before enabling the standalone schedule.");
  if (bound.some(agent => agent.state === "active")) throw new Error("Pause the bound agent before changing its Scout.");
  for (const agent of bound) {
    const previous = await connection.query.customAgentVersions.findFirst({ where: and(eq(customAgentVersions.tenantId, actor.tenantId), eq(customAgentVersions.agentId, agent.id), eq(customAgentVersions.version, agent.configVersion)) });
    const config = agentConfigSchema.parse(previous?.config);
    await connection.update(customAgents).set({ configVersion: agent.configVersion + 1, approvedVersion: null, approvedBy: null, updatedAt: new Date() }).where(eq(customAgents.id, agent.id));
    await connection.update(customAgentRuns).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(customAgentRuns.tenantId, actor.tenantId), eq(customAgentRuns.agentId, agent.id), eq(customAgentRuns.status, "running")));
    await snapshot(connection, actor, agent.id, agent.configVersion + 1, config);
  }
}
export async function listAgencyAgents(actor: AgencyActor) {
  await requireAgencyMember(actor);
  const [agents, accounts] = await Promise.all([
    db.query.customAgents.findMany({ where: eq(customAgents.tenantId, actor.tenantId), orderBy: [desc(customAgents.updatedAt)], limit: 20 }),
    db.query.customAgentAccounts.findMany({ where: eq(customAgentAccounts.tenantId, actor.tenantId), limit: 300 }),
  ]);
  return agents.map(agent => ({ ...agent, accountIds: accounts.filter(binding => binding.agentId === agent.id).map(binding => binding.accountId) }));
}
export async function saveAgencyAgent(actor: AgencyActor, input: unknown, existing?: { id: string; version: number }) {
  const config = agentConfigSchema.parse(input);
  return db.transaction(async tx => {
    await lockAgency(tx, actor.tenantId);
    const membership = await requireAgencyMember(actor, tx);
    await validateAgencyBindings(tx, actor.tenantId, config);
    const { accountIds: _accountIds, ...values } = config;
    let agent;
    if (existing) {
      const row = await tx.query.customAgents.findFirst({ where: and(eq(customAgents.tenantId, actor.tenantId), eq(customAgents.id, existing.id)) });
      if (!row || row.state === "archived") throw new Error("Agent not found.");
      if (row.state === "active" && !canOperateAgency(membership.role)) throw new Error("Only workspace admins can edit an active agent.");
      [agent] = await tx.update(customAgents).set({ ...values, configVersion: existing.version + 1, state: "paused", approvedVersion: null, approvedBy: null, updatedAt: new Date() })
        .where(and(eq(customAgents.id, row.id), eq(customAgents.tenantId, actor.tenantId), eq(customAgents.configVersion, existing.version))).returning();
      if (!agent) throw new Error("Agent changed before it could be saved. Refresh and try again.");
      await tx.update(customAgentRuns).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(customAgentRuns.tenantId, actor.tenantId), eq(customAgentRuns.agentId, agent.id), eq(customAgentRuns.status, "running")));
    } else {
      const [total] = await tx.select({ value: count() }).from(customAgents).where(eq(customAgents.tenantId, actor.tenantId));
      if (total.value >= 20) throw new Error("This workspace has reached the 20-agent safety limit. Reuse an existing agent.");
      [agent] = await tx.insert(customAgents).values({ ...values, tenantId: actor.tenantId, createdBy: actor.userId, state: "paused" }).returning();
    }
    await snapshot(tx, actor, agent.id, agent.configVersion, config);
    return { ...agent, accountIds: config.accountIds };
  });
}
export async function changeAgencyAgentState(actor: AgencyActor, id: string, version: number, state: "active" | "paused" | "archived") {
  return db.transaction(async tx => {
    await lockAgency(tx, actor.tenantId);
    const membership = await requireAgencyMember(actor, tx);
    if (!canOperateAgency(membership.role)) throw new Error("Only workspace owners or admins can activate, pause, or archive agents.");
    const agent = await tx.query.customAgents.findFirst({ where: and(eq(customAgents.tenantId, actor.tenantId), eq(customAgents.id, id)) });
    if (!agent || agent.state === "archived" || agent.configVersion !== version) throw new Error("Agent configuration changed. Refresh and try again.");
    if (state === "active") {
      const current = await tx.query.customAgentVersions.findFirst({ where: and(eq(customAgentVersions.tenantId, actor.tenantId), eq(customAgentVersions.agentId, id), eq(customAgentVersions.version, version)) });
      if (!current) throw new Error("Agent configuration unavailable.");
      const config = agentConfigSchema.parse(current.config);
      if (!config.scoutId || !config.themePageId) throw new Error("Configure an Instagram Scout and Theme Page before activating automation.");
      await validateAgencyBindings(tx, actor.tenantId, config);
    }
    const [saved] = await tx.update(customAgents).set({ state, approvedVersion: state === "active" ? version : null, approvedBy: state === "active" ? actor.userId : null, updatedAt: new Date() })
      .where(and(eq(customAgents.tenantId, actor.tenantId), eq(customAgents.id, id), eq(customAgents.configVersion, version))).returning();
    if (state !== "active") await tx.update(customAgentRuns).set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(customAgentRuns.tenantId, actor.tenantId), eq(customAgentRuns.agentId, id), eq(customAgentRuns.status, "running")));
    return saved;
  });
}
export async function getAgencyProfile(actor: AgencyActor, id: string, includeArchived = false) {
  await requireAgencyMember(actor);
  const agent = await db.query.customAgents.findFirst({ where: and(eq(customAgents.tenantId, actor.tenantId), eq(customAgents.id, id)) });
  if (!agent || agent.state === "archived" && !includeArchived) throw new Error("Agent not found.");
  const bound = await db.query.customAgentAccounts.findMany({ where: and(eq(customAgentAccounts.tenantId, actor.tenantId), eq(customAgentAccounts.agentId, id)), limit: 15 });
  return { ...agent, accountIds: bound.map(binding => binding.accountId) };
}
export async function reserveAgencyRun(actor: AgencyActor, id: string, version: number, eventKey: string) {
  if (!/^[a-zA-Z0-9:_-]{1,128}$/.test(eventKey)) throw new Error("Invalid event identity.");
  return db.transaction(async tx => {
    await lockAgency(tx, actor.tenantId);
    const membership = await requireAgencyMember(actor, tx);
    if (!canOperateAgency(membership.role)) throw new Error("Only workspace admins can run automation.");
    const agent = await tx.query.customAgents.findFirst({ where: and(eq(customAgents.tenantId, actor.tenantId), eq(customAgents.id, id)) });
    if (!agent || agent.state !== "active" || agent.configVersion !== version || agent.approvedVersion !== version) throw new Error("Activate the current agent configuration before running it.");
    if (!agent.approvedBy || !canOperateAgency((await requireAgencyMember({ tenantId: actor.tenantId, userId: agent.approvedBy }, tx)).role)) throw new Error("The activation approver no longer has workspace authority. Reactivate with a current admin.");
    const config = await tx.query.customAgentVersions.findFirst({ where: and(eq(customAgentVersions.tenantId, actor.tenantId), eq(customAgentVersions.agentId, id), eq(customAgentVersions.version, version)) });
    await validateAgencyBindings(tx, actor.tenantId, agentConfigSchema.parse(config?.config));
    await settleExpiredAgencyRuns(tx, actor.tenantId, id);
    const where = and(eq(customAgentRuns.tenantId, actor.tenantId), eq(customAgentRuns.agentId, id), eq(customAgentRuns.configVersion, version), eq(customAgentRuns.eventKey, eventKey));
    const existing = await tx.query.customAgentRuns.findFirst({ where });
    const now = new Date();
    if (existing && (existing.packageId || existing.attempt >= 3 || ["queued", "completed", "cancelled"].includes(existing.status) || (existing.status === "running" && existing.leaseExpiresAt > now))) return { claimed: false, run: existing };
    const midnight = new Date(now); midnight.setUTCHours(0, 0, 0, 0);
    const [used] = await tx.select({ value: sql<number>`coalesce(sum(${customAgentRuns.attempt}), 0)::integer` }).from(customAgentRuns).where(and(eq(customAgentRuns.tenantId, actor.tenantId), eq(customAgentRuns.agentId, id), gte(customAgentRuns.createdAt, midnight)));
    if (used.value >= agent.dailyDraftLimit) throw new Error("Agent daily draft limit reached. Try again tomorrow (UTC).");
    const lease = { status: "running", leaseToken: randomUUID(), leaseExpiresAt: new Date(now.getTime() + 300_000), error: null, updatedAt: now };
    if (existing) {
      const [run] = await tx.update(customAgentRuns).set({ ...lease, attempt: existing.attempt + 1 }).where(eq(customAgentRuns.id, existing.id)).returning();
      return { claimed: true, run };
    }
    // Failed/cancelled attempts consume the slot too; repeatedly changing a
    // configuration cannot evade the agent's daily bound.
    const [run] = await tx.insert(customAgentRuns).values({ ...lease, tenantId: actor.tenantId, agentId: id, configVersion: version, eventKey }).returning();
    return { claimed: true, run };
  });
}

export async function assertAgencyRunCurrent(run: typeof customAgentRuns.$inferSelect, connection: AgencyDb = db) {
  if (connection !== db) await lockAgency(connection, run.tenantId);
  const agent = await connection.query.customAgents.findFirst({ where: and(eq(customAgents.tenantId, run.tenantId), eq(customAgents.id, run.agentId)) });
  const receipt = await connection.query.customAgentRuns.findFirst({ where: and(eq(customAgentRuns.id, run.id), eq(customAgentRuns.tenantId, run.tenantId), eq(customAgentRuns.leaseToken, run.leaseToken)) });
  if (!agent || agent.state !== "active" || agent.configVersion !== run.configVersion || agent.approvedVersion !== run.configVersion || !agent.approvedBy || receipt?.status !== "running" || receipt.leaseExpiresAt <= new Date()) throw new Error("Agent run was paused, replaced, or expired.");
  const actor = { tenantId: run.tenantId, userId: agent.approvedBy };
  if (!canOperateAgency((await requireAgencyMember(actor, connection)).role)) throw new Error("Activation authority was revoked.");
  const snapshot = await connection.query.customAgentVersions.findFirst({ where: and(eq(customAgentVersions.tenantId, run.tenantId), eq(customAgentVersions.agentId, run.agentId), eq(customAgentVersions.version, run.configVersion)) });
  const config = agentConfigSchema.parse(snapshot?.config);
  await validateAgencyBindings(connection, run.tenantId, config);
  return { actor, config };
}

export async function attachAgencyDraft(connection: AgencyDb, run: typeof customAgentRuns.$inferSelect, packageId: string) {
  await connection.update(customAgentRuns).set({ packageId, updatedAt: new Date() }).where(and(eq(customAgentRuns.id, run.id), eq(customAgentRuns.tenantId, run.tenantId), eq(customAgentRuns.leaseToken, run.leaseToken), eq(customAgentRuns.status, "running")));
}
export async function finishAgencyRun(run: typeof customAgentRuns.$inferSelect, status: "queued" | "completed" | "failed", result?: { packageId?: string; error?: string }) {
  return db.transaction(async tx => {
    await lockAgency(tx, run.tenantId);
    const agent = await tx.query.customAgents.findFirst({ where: and(eq(customAgents.tenantId, run.tenantId), eq(customAgents.id, run.agentId)) });
    if (!agent || agent.state !== "active" || agent.configVersion !== run.configVersion || agent.approvedVersion !== run.configVersion) return false;
    let nextStatus = status;
    if (result?.packageId) {
      // Same package row lock as worker attachment: a late queued write cannot
      // overwrite a render that already completed (or failed).
      const [pkg] = await tx.select().from(contentPackages).where(and(eq(contentPackages.tenantId, run.tenantId), eq(contentPackages.id, result.packageId))).for("update");
      if (!pkg || pkg.themePageId !== agent.themePageId) throw new Error("Run output ownership mismatch.");
      if (status === "queued" && Array.isArray(pkg.renderedAssetUrls) && pkg.renderedAssetUrls.length) nextStatus = "completed";
      else if (status === "queued" && pkg.status === "failed") nextStatus = "failed";
    }
    const [updated] = await tx.update(customAgentRuns).set({ status: nextStatus, ...(result?.packageId ? { packageId: result.packageId } : {}), error: result?.error?.slice(0, 500) ?? null, updatedAt: new Date() })
      .where(and(eq(customAgentRuns.id, run.id), eq(customAgentRuns.tenantId, run.tenantId), eq(customAgentRuns.leaseToken, run.leaseToken), eq(customAgentRuns.status, "running"), sql`${customAgentRuns.leaseExpiresAt} > now()`)).returning({ id: customAgentRuns.id });
    return Boolean(updated);
  });
}
export async function listAgencyRuns(actor: AgencyActor, id: string) {
  await getAgencyProfile(actor, id);
  await settleExpiredAgencyRuns(db, actor.tenantId, id);
  const runs = await db.query.customAgentRuns.findMany({ where: and(eq(customAgentRuns.tenantId, actor.tenantId), eq(customAgentRuns.agentId, id)), orderBy: [desc(customAgentRuns.createdAt)], limit: 30 });
  const packageIds = runs.flatMap(run => run.packageId ? [run.packageId] : []);
  const packages = packageIds.length ? await db.query.contentPackages.findMany({
    where: and(eq(contentPackages.tenantId, actor.tenantId), inArray(contentPackages.id, packageIds)),
    columns: { id: true, themePageId: true }, limit: 30,
  }) : [];
  return runs.map(run => ({ ...run, packageThemePageId: packages.find(pkg => pkg.id === run.packageId)?.themePageId ?? null }));
}
// Call only with the actual ID emitted by Eve's server-side session.started
// hook. No browser API accepts an arbitrary session ID for registration.
export async function registerAgencyThread(actor: AgencyActor, agentId: string, configVersion: number, sessionId: string) {
  const agent = await getAgencyProfile(actor, agentId);
  if (agent.configVersion !== configVersion) throw new Error("Agent configuration changed.");
  const [thread] = await db.insert(customAgentThreads).values({ ...actor, agentId, configVersion, sessionId }).onConflictDoNothing({ target: customAgentThreads.sessionId }).returning();
  if (thread) return thread;
  const existing = await db.query.customAgentThreads.findFirst({ where: eq(customAgentThreads.sessionId, sessionId) });
  if (!existing) throw new Error("Conversation unavailable.");
  assertAgentSessionAccess({ actor, agentId, agentVersion: configVersion, agentState: agent.state, thread: existing, write: true });
  return existing;
}
export async function listAgencyThreads(actor: AgencyActor, agentId: string) {
  await getAgencyProfile(actor, agentId);
  return db.query.customAgentThreads.findMany({ where: and(eq(customAgentThreads.tenantId, actor.tenantId), eq(customAgentThreads.userId, actor.userId), eq(customAgentThreads.agentId, agentId)), orderBy: [desc(customAgentThreads.updatedAt)], limit: 30 });
}
