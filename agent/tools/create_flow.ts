import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "@/lib/db";
import { flows } from "@/lib/db/schema";
import { officialTemplates } from "@/lib/flows/templates";
import { validateGraph } from "@/lib/flows/validation";
import type { FlowGraphDoc } from "@/lib/flows/types";

export default defineTool({
  description:
    "Create an automated workflow pipeline (Flow) for content curation, scheduled drafting, web search syndication, or AI comment approvals. Returns the flow ID and link to edit or activate in the Flow Studio.",
  inputSchema: z.object({
    name: z.string().min(1).max(120).describe("Name of the automated flow (e.g. 'Daily AI News Curator' or 'Tech Blog Syndicator')."),
    description: z.string().optional().describe("Brief summary of what this automation does."),
    templateSlug: z
      .enum([
        "daily-news-curator",
        "blog-social-syndication",
        "competitor-intelligence",
        "comment-responder",
        "hook-mining",
      ])
      .default("daily-news-curator")
      .describe("Starter flow template to base this automation on."),
    queryOrUrl: z
      .string()
      .optional()
      .describe("Custom search topic for Exa (e.g. 'Anthropic AI models') or RSS URL (e.g. 'https://news.ycombinator.com/rss')."),
    targetPlatform: z
      .enum(["twitter", "linkedin", "instagram"])
      .default("twitter")
      .describe("Target platform to generate drafts for."),
  }),
  execute: async ({ name, description, templateSlug, queryOrUrl, targetPlatform }, ctx) => {
    const tenantId = ctx.session?.auth?.current?.attributes?.tenantId as string | undefined;
    if (!tenantId) {
      return { error: "No active tenant session found. Please sign in to create flows." };
    }

    const template = officialTemplates.find((t) => t.slug === templateSlug) || officialTemplates[2]; // daily-news-curator default
    const graph: FlowGraphDoc = JSON.parse(JSON.stringify(template.graph));

    // Customize the cloned graph based on user parameters
    for (const node of graph.nodes) {
      if (node.type === "data.exa_search" && queryOrUrl) {
        node.config = { ...node.config, query: queryOrUrl };
      } else if (node.type === "data.rss" && queryOrUrl) {
        node.config = { ...node.config, url: queryOrUrl };
      } else if (node.type === "action.create_draft") {
        node.config = { ...node.config, platform: targetPlatform };
      }
    }

    const validation = validateGraph(graph);
    if (!validation.ok) {
      return {
        error: "Flow graph failed validation",
        issues: validation.issues,
      };
    }

    const [flow] = await db
      .insert(flows)
      .values({
        tenantId,
        name: name.trim(),
        description: description || template.description,
        graph,
        status: "draft",
      })
      .returning();

    return {
      success: true,
      flowId: flow.id,
      name: flow.name,
      status: flow.status,
      url: `/flows/${flow.id}`,
      message: `Created flow "${flow.name}" successfully. You can open and activate it at /flows/${flow.id}`,
    };
  },
});
