import { defineTool } from "eve/tools";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { socialAccounts, themePages, contentPackages, drafts } from "@/lib/db/schema";

export default defineTool({
  description: "Read the active workspace's connected accounts, Theme Studio pages, recent content packages, and drafts. Use before choosing publishing accounts or answering questions about the workspace. Returns no credentials.",
  inputSchema: z.object({}),
  execute: async (_input, ctx) => {
    const tenantId = ctx.session.auth.current?.attributes?.tenantId as string | undefined;
    if (!tenantId) return { error: "Sign in and select a workspace first." };
    const [accounts, pages, packages, recentDrafts] = await Promise.all([
      db.query.socialAccounts.findMany({ where: and(eq(socialAccounts.tenantId, tenantId), eq(socialAccounts.isActive, true)), columns: { id: true, platform: true, accountName: true } }),
      db.query.themePages.findMany({ where: eq(themePages.tenantId, tenantId), columns: { id: true, name: true, niche: true, status: true }, orderBy: [desc(themePages.updatedAt)], limit: 50 }),
      db.query.contentPackages.findMany({ where: eq(contentPackages.tenantId, tenantId), columns: { id: true, themePageId: true, title: true, status: true, scheduledFor: true, error: true }, orderBy: [desc(contentPackages.createdAt)], limit: 25 }),
      db.query.drafts.findMany({ where: eq(drafts.tenantId, tenantId), columns: { id: true, content: true, status: true, scheduledFor: true }, orderBy: [desc(drafts.createdAt)], limit: 25 }),
    ]);
    return { accounts, pages: pages.map(page => ({ ...page, url: `/theme-studio/${page.id}` })), packages, drafts: recentDrafts.map(draft => ({ ...draft, content: draft.content?.slice(0, 500), url: `/compose?draftId=${draft.id}` })), links: { themeStudio: "/theme-studio", compose: "/compose", drafts: "/drafts", calendar: "/calendar", flows: "/flows" } };
  },
});
