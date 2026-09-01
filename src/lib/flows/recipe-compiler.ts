import type { FlowGraphDoc, FlowGraphNode, FlowGraphEdge } from "./types";
import { validateGraph } from "./validation";
import { db } from "@/lib/db";
import { flows, themePages, themeSources, themeSlots, themeContentFormats } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export interface CompileThemeRecipeInput {
  page: {
    id: string;
    name: string;
    niche?: string | null;
    audience?: string | null;
    voice?: string | null;
    defaultRightsPolicy?: string | null;
  };
  sources: Array<{
    id: string;
    name: string;
    sourceType: string;
    url: string;
    isActive: boolean;
  }>;
  slots: Array<{
    id: string;
    label?: string | null;
    priority: number;
    format?: {
      slug: string;
      name: string;
      platform: string;
      mediaType: string;
    } | null;
  }>;
}

export function compileThemeRecipe(input: CompileThemeRecipeInput): {
  graph: FlowGraphDoc;
  flowName: string;
  isValid: boolean;
  validationIssues: string[];
} {
  const { page, sources, slots } = input;
  const flowName = `[Theme] ${page.name}`;
  const nodes: FlowGraphNode[] = [];
  const edges: FlowGraphEdge[] = [];

  const activeSources = sources.filter((s) => s.isActive);
  const activeSlots = slots.filter((s) => s.format);

  // 1. Trigger Node (Schedule)
  const triggerNodeId = "trigger_schedule";
  nodes.push({
    id: triggerNodeId,
    type: "trigger.schedule",
    config: { intervalMinutes: 1440 }, // Daily
    position: { x: 50, y: 300 },
  });

  // If no sources exist, create a fallback manual research step or empty
  if (activeSources.length === 0) {
    const researchNodeId = "data_research_fallback";
    nodes.push({
      id: researchNodeId,
      type: "data.exa_search",
      config: { query: page.niche || page.name, numResults: 5 },
      position: { x: 300, y: 300 },
    });
    edges.push({ from: triggerNodeId, to: researchNodeId });

    const draftNodeId = "action_draft_fallback";
    nodes.push({
      id: draftNodeId,
      type: "action.create_draft",
      config: { platform: "twitter" },
      position: { x: 600, y: 300 },
    });
    edges.push({ from: researchNodeId, to: draftNodeId });

    const graph: FlowGraphDoc = { nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } };
    const validation = validateGraph(graph);

    return {
      graph,
      flowName,
      isValid: validation.ok,
      validationIssues: validation.issues.map((i) => i.message),
    };
  }

  // 2. Data Ingestion Nodes
  const sourceNodeIds: string[] = [];
  activeSources.forEach((src, idx) => {
    const nodeId = `source_${idx + 1}_${src.id.slice(0, 8)}`;
    sourceNodeIds.push(nodeId);

    let nodeType = "data.rss";
    let nodeConfig: Record<string, unknown> = { url: src.url, limit: 20 };

    if (src.sourceType === "reddit") {
      nodeType = "data.reddit";
      const subredditMatch = src.url.match(/r\/([a-zA-Z0-9_]+)/);
      const subreddit = subredditMatch ? subredditMatch[1] : src.url.replace(/^r\//, "");
      nodeConfig = { subreddit, sort: "hot", limit: 10 };
    } else if (src.sourceType === "http") {
      nodeType = "data.http";
      nodeConfig = { url: src.url, method: "GET" };
    }

    const yPos = 150 + idx * 120;
    nodes.push({
      id: nodeId,
      type: nodeType,
      config: nodeConfig,
      position: { x: 300, y: yPos },
    });

    edges.push({ from: triggerNodeId, to: nodeId });
  });

  // 3. Deduplication Node
  const dedupeNodeId = "transform_dedupe";
  nodes.push({
    id: dedupeNodeId,
    type: "transform.dedupe",
    config: { field: "title" },
    position: { x: 600, y: 300 },
  });

  sourceNodeIds.forEach((srcId) => {
    edges.push({ from: srcId, to: dedupeNodeId });
  });

  // 4. AI Editorial & Angle Synthesizer
  const editorialNodeId = "ai_editorial_synthesis";
  const systemPrompt = [
    `You are the executive editor for the niche social media page "${page.name}".`,
    page.niche ? `Niche: ${page.niche}` : "",
    page.audience ? `Target Audience: ${page.audience}` : "",
    page.voice ? `Brand Voice & Tone: ${page.voice}` : "Tone: Authoritative, engaging, concise.",
    "Synthesize incoming items into verified story angles. Maintain strict factual fidelity and cite facts clearly.",
  ]
    .filter(Boolean)
    .join("\n");

  nodes.push({
    id: editorialNodeId,
    type: "ai.llm",
    config: {
      provider: "openai",
      model: "gpt-4o-mini",
      systemPrompt,
      userTemplate: "Analyze today's news items and synthesize the top 3 story angles:\n\n{{input}}",
    },
    position: { x: 900, y: 300 },
  });

  edges.push({ from: dedupeNodeId, to: editorialNodeId });

  // 5. Slot Generation Nodes & Actions
  if (activeSlots.length === 0) {
    // Default draft creation
    const approvalNodeId = "logic_approval_gate";
    nodes.push({
      id: approvalNodeId,
      type: "logic.approval",
      config: { prompt: `Approve generated content for ${page.name}` },
      position: { x: 1200, y: 300 },
    });
    edges.push({ from: editorialNodeId, to: approvalNodeId });

    const draftNodeId = "action_create_draft";
    nodes.push({
      id: draftNodeId,
      type: "action.create_draft",
      config: { platform: "twitter" },
      position: { x: 1500, y: 300 },
    });
    edges.push({ from: approvalNodeId, to: draftNodeId });
  } else {
    const slotNodeIds: string[] = [];

    activeSlots.forEach((slot, idx) => {
      const slotNodeId = `slot_ai_${idx + 1}_${slot.id.slice(0, 8)}`;
      slotNodeIds.push(slotNodeId);

      const format = slot.format!;
      const yPos = 150 + idx * 140;

      nodes.push({
        id: slotNodeId,
        type: "ai.llm",
        config: {
          provider: "openai",
          model: "gpt-4o-mini",
          systemPrompt: `Format this story for slot "${slot.label || format.name}" (${format.platform}, ${format.mediaType}). Ensure optimal hook, body, and call-to-action.`,
          userTemplate: "Story angle:\n\n{{input}}",
        },
        position: { x: 1200, y: yPos },
      });

      edges.push({ from: editorialNodeId, to: slotNodeId });
    });

    // Approval Gate
    const approvalNodeId = "logic_approval_gate";
    nodes.push({
      id: approvalNodeId,
      type: "logic.approval",
      config: { prompt: `Review and approve today's daily mix for ${page.name}` },
      position: { x: 1500, y: 300 },
    });

    slotNodeIds.forEach((slotId) => {
      edges.push({ from: slotId, to: approvalNodeId });
    });

    // Draft Creation
    const draftNodeId = "action_create_draft";
    nodes.push({
      id: draftNodeId,
      type: "action.create_draft",
      config: { platform: "twitter" },
      position: { x: 1800, y: 300 },
    });

    edges.push({ from: approvalNodeId, to: draftNodeId });
  }

  const graph: FlowGraphDoc = {
    nodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 0.9 },
  };

  const validation = validateGraph(graph);

  return {
    graph,
    flowName,
    isValid: validation.ok,
    validationIssues: validation.issues.map((i) => i.message),
  };
}

export async function syncThemePageFlow(tenantId: string, themePageId: string) {
  const page = await db.query.themePages.findFirst({
    where: and(eq(themePages.id, themePageId), eq(themePages.tenantId, tenantId)),
  });

  if (!page) {
    throw new Error("Theme page not found");
  }

  const sources = await db.query.themeSources.findMany({
    where: and(eq(themeSources.themePageId, themePageId), eq(themeSources.tenantId, tenantId)),
  });

  const slots = await db.query.themeSlots.findMany({
    where: and(eq(themeSlots.themePageId, themePageId), eq(themeSlots.tenantId, tenantId)),
    orderBy: [themeSlots.priority],
  });

  const formats = await db.query.themeContentFormats.findMany({
    where: eq(themeContentFormats.tenantId, tenantId),
  });
  const formatMap = new Map(formats.map((f) => [f.id, f]));

  const slotsWithFormats = slots.map((s) => ({
    ...s,
    format: formatMap.get(s.formatId) || null,
  }));

  const compiled = compileThemeRecipe({
    page,
    sources,
    slots: slotsWithFormats,
  });

  const existingFlow = await db.query.flows.findFirst({
    where: and(eq(flows.name, compiled.flowName), eq(flows.tenantId, tenantId)),
  });

  let flowRecord;
  if (existingFlow) {
    const [updated] = await db
      .update(flows)
      .set({
        graph: compiled.graph,
        executionRevision: existingFlow.executionRevision + 1,
        updatedAt: new Date(),
      })
      .where(eq(flows.id, existingFlow.id))
      .returning();
    flowRecord = updated;
  } else {
    const [created] = await db
      .insert(flows)
      .values({
        tenantId,
        name: compiled.flowName,
        description: `Automated content generation pipeline for theme page: ${page.name}`,
        graph: compiled.graph,
        status: page.status === "active" ? "active" : "draft",
      })
      .returning();
    flowRecord = created;
  }

  await db
    .update(themePages)
    .set({
      lastCompiledAt: new Date(),
      recipeRevision: page.recipeRevision + 1,
      updatedAt: new Date(),
    })
    .where(eq(themePages.id, themePageId));

  return {
    flow: flowRecord,
    compiled,
  };
}
