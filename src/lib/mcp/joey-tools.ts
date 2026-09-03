import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  drafts,
  socialAccounts,
  posts,
  flows,
  engagementItems,
  themePages,
} from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { parseGraphDoc, validateGraph } from "@/lib/flows/validation";

export interface McpAuth {
  tenantId: string;
  scopes: string[];
}

function assertScope(auth: McpAuth, required: string) {
  if (!auth.scopes.includes(required)) {
    throw new Error(`Insufficient scope: requires '${required}'`);
  }
}

function truncate(text: string | null | undefined, max = 300): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "…" : text;
}

/**
 * Headless Joey tools for external MCP clients (Claude Desktop, Codex).
 * Unlike the in-page WebMCP tools (React state + human clicks Save/Approve),
 * these run against the service layer with `joe_*` Bearer auth and explicit
 * scope checks. No DOM or open page required.
 */
export function createJoeyMcpServer(auth: McpAuth): McpServer {
  const server = new McpServer(
    { name: "joey", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.tool(
    "joey_list_drafts",
    "List social media drafts for the tenant. Filter by status (pending_review, approved, published, rejected).",
    { status: z.string().optional() },
    async ({ status }) => {
      assertScope(auth, "read");
      const conditions = [eq(drafts.tenantId, auth.tenantId)];
      if (status) conditions.push(eq(drafts.status, status));
      const rows = await db.query.drafts.findMany({
        where: and(...conditions),
        orderBy: [desc(drafts.createdAt)],
        limit: 50,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              rows.map((d) => ({
                id: d.id,
                status: d.status,
                content: truncate(d.content, 500),
                scheduledFor: d.scheduledFor,
                createdAt: d.createdAt,
              })),
            ),
          },
        ],
      };
    },
  );

  server.tool(
    "joey_create_draft",
    "Create a new draft in pending_review. A human must approve it in the Joey UI before it publishes.",
    {
      content: z.string().min(1).max(10000),
      mediaUrls: z.array(z.string().url()).optional(),
      accountIds: z.array(z.string()).optional(),
      scheduledFor: z.string().optional(),
    },
    async ({ content, mediaUrls, accountIds, scheduledFor }) => {
      assertScope(auth, "write");
      const [draft] = await db
        .insert(drafts)
        .values({
          tenantId: auth.tenantId,
          content,
          status: "pending_review",
          scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
          platformOptions: { mediaUrls, accountIds },
        })
        .returning({ id: drafts.id });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              id: draft.id,
              status: "pending_review",
              message: "Draft created. A human must approve it in Joey before publishing.",
            }),
          },
        ],
      };
    },
  );

  server.tool(
    "joey_approve_draft",
    "Approve a draft so it becomes eligible for publishing. Requires the approve scope.",
    { draftId: z.string().min(1) },
    async ({ draftId }) => {
      assertScope(auth, "approve");
      const existing = await db.query.drafts.findFirst({
        where: and(eq(drafts.id, draftId), eq(drafts.tenantId, auth.tenantId)),
        columns: { content: true },
      });
      if (!existing) throw new Error("Draft not found");
      if (!existing.content) {
        throw new Error("Cannot approve a draft without content.");
      }
      await db
        .update(drafts)
        .set({ status: "approved", errorMessage: null })
        .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, auth.tenantId)));
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: true, draftId }) }],
      };
    },
  );

  server.tool(
    "joey_reject_draft",
    "Reject a draft with an optional reason. Requires the approve scope.",
    { draftId: z.string().min(1), reason: z.string().optional() },
    async ({ draftId, reason }) => {
      assertScope(auth, "approve");
      const updated = await db
        .update(drafts)
        .set({ status: "rejected", errorMessage: reason ?? "Rejected via MCP" })
        .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, auth.tenantId)))
        .returning({ id: drafts.id });
      if (updated.length === 0) throw new Error("Draft not found");
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: true, draftId }) }],
      };
    },
  );

  server.tool(
    "joey_list_accounts",
    "List connected social accounts for the tenant.",
    {},
    async () => {
      assertScope(auth, "read");
      const rows = await db.query.socialAccounts.findMany({
        where: eq(socialAccounts.tenantId, auth.tenantId),
        orderBy: [desc(socialAccounts.createdAt)],
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              rows.map((a) => ({
                id: a.id,
                platform: a.platform,
                handle: (a as Record<string, unknown>).handle ?? null,
                createdAt: a.createdAt,
              })),
            ),
          },
        ],
      };
    },
  );

  server.tool(
    "joey_list_posts",
    "List published/scheduled posts for the tenant.",
    { limit: z.number().int().min(1).max(50).optional() },
    async ({ limit }) => {
      assertScope(auth, "read");
      const rows = await db.query.posts.findMany({
        where: eq(posts.tenantId, auth.tenantId),
        orderBy: [desc(posts.publishedAt)],
        limit: limit ?? 20,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              rows.map((p) => ({
                id: p.id,
                status: p.status,
                content: truncate(p.content, 300),
                publishedAt: p.publishedAt,
              })),
            ),
          },
        ],
      };
    },
  );

  server.tool(
    "joey_list_flows",
    "List automation flows for the tenant (id, name, status).",
    {},
    async () => {
      assertScope(auth, "read");
      const rows = await db.query.flows.findMany({
        where: eq(flows.tenantId, auth.tenantId),
        orderBy: [desc(flows.updatedAt)],
        limit: 50,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              rows.map((f) => ({
                id: f.id,
                name: (f.graph as Record<string, unknown> | null)?.name ?? f.id,
                status: f.status,
                lastRunAt: f.lastRunAt,
              })),
            ),
          },
        ],
      };
    },
  );

  server.tool(
    "joey_validate_flow",
    "Validate a flow graph without executing it. Returns errors and warnings.",
    { flowId: z.string().min(1) },
    async ({ flowId }) => {
      assertScope(auth, "read");
      const flow = await db.query.flows.findFirst({
        where: and(eq(flows.id, flowId), eq(flows.tenantId, auth.tenantId)),
      });
      if (!flow) throw new Error("Flow not found");
      const doc = parseGraphDoc(flow.graph);
      const result = validateGraph(doc);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    },
  );

  server.tool(
    "joey_list_engagement",
    "List pending engagement items (comments/DMs awaiting replies). Reply drafts must be created in the Joey UI — this is read-only.",
    { limit: z.number().int().min(1).max(50).optional() },
    async ({ limit }) => {
      assertScope(auth, "read");
      const rows = await db.query.engagementItems.findMany({
        where: and(
          eq(engagementItems.tenantId, auth.tenantId),
          eq(engagementItems.status, "pending"),
        ),
        orderBy: [desc(engagementItems.createdAt)],
        limit: limit ?? 20,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              rows.map((e) => ({
                id: e.id,
                platform: e.platform,
                text: truncate(e.text, 300),
                commenter: e.commenterName ?? e.commenterHandle,
                createdAt: e.createdAt,
              })),
            ),
          },
        ],
      };
    },
  );

  server.tool(
    "joey_theme_readiness",
    "Check Theme Studio page readiness (read-only). Activation and publishing stay human-only in the Joey UI.",
    {},
    async () => {
      assertScope(auth, "read");
      const rows = await db.query.themePages.findMany({
        where: eq(themePages.tenantId, auth.tenantId),
        orderBy: [desc(themePages.updatedAt)],
        limit: 20,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              rows.map((t) => ({
                id: t.id,
                status: (t as Record<string, unknown>).status ?? "unknown",
                updatedAt: t.updatedAt,
              })),
            ),
          },
        ],
      };
    },
  );

  return server;
}
