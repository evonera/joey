import type { FlowGraphDoc, FlowGraphNode, FlowGraphEdge } from "./types";
import { validateGraph } from "./validation";
import { db } from "@/lib/db";
import { flows, socialAccounts, themePages, themeSources, themeSlots, themeContentFormats } from "@/lib/db/schema";
import { eq, and, inArray, like } from "drizzle-orm";

export interface CompileThemeRecipeInput {
  page: {
    id: string;
    name: string;
    niche?: string | null;
    audience?: string | null;
    voice?: string | null;
    defaultRightsPolicy?: string | null;
    connectedPlatforms: string[];
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
  const activeSources = sources.filter((s) => s.isActive);
  const activeSlots = slots.filter((s) => s.format);
  const connectedPlatforms = new Set(page.connectedPlatforms.map((platform) => platform === "twitter" ? "x" : platform));
  const missingPlatforms = Array.from(new Set(
    activeSlots
      .map((slot) => slot.format?.platform)
      .filter((platform): platform is string => Boolean(platform))
      .filter((platform) => !connectedPlatforms.has(platform === "twitter" ? "x" : platform)),
  ));
  const validationIssues = [
    ...(activeSources.length === 0 ? ["Add at least one active Theme Studio source."] : []),
    ...(activeSlots.length === 0 ? ["Add at least one active Theme Studio content slot."] : []),
    ...(activeSlots.some((slot) => slot.format?.mediaType === "video")
      ? ["Remove video slots until a production MP4 renderer is configured."]
      : []),
    ...missingPlatforms.map((platform) => `Select an active ${platform} publishing account.`),
  ];
  const graph: FlowGraphDoc = {
    nodes: [
      {
        id: "trigger_schedule",
        type: "trigger.schedule",
        config: { intervalMinutes: 1440 },
        position: { x: 100, y: 200 },
      },
      {
        id: "action_theme_studio_run",
        type: "action.theme_studio_run",
        config: { themePageId: page.id },
        position: { x: 450, y: 200 },
      },
    ],
    edges: [{ from: "trigger_schedule", to: "action_theme_studio_run" }],
    viewport: { x: 0, y: 0, zoom: 0.9 },
  };

  const validation = validateGraph(graph);

  return {
    graph,
    flowName,
    isValid: validation.ok && validationIssues.length === 0,
    validationIssues: [...validationIssues, ...validation.issues.map((i) => i.message)],
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
  const selectedAccountIds = Array.isArray(page.connectedAccounts)
    ? page.connectedAccounts.filter((id): id is string => typeof id === "string")
    : [];
  const selectedAccounts = selectedAccountIds.length > 0
    ? await db.query.socialAccounts.findMany({
        where: and(
          eq(socialAccounts.tenantId, tenantId),
          eq(socialAccounts.isActive, true),
          inArray(socialAccounts.id, selectedAccountIds),
        ),
        columns: { platform: true },
      })
    : [];

  const slotsWithFormats = slots.map((s) => ({
    ...s,
    format: formatMap.get(s.formatId) || null,
  }));

  const compiled = compileThemeRecipe({
    page: { ...page, connectedPlatforms: selectedAccounts.map((account) => account.platform) },
    sources,
    slots: slotsWithFormats,
  });

  if (!compiled.isValid) {
    return { flow: null, compiled };
  }

  const descriptionPrefix = `[Theme Studio:${themePageId}]`;
  const existingFlow = await db.query.flows.findFirst({
    where: and(
      eq(flows.tenantId, tenantId),
      like(flows.description, `${descriptionPrefix}%`),
    ),
  });

  let flowRecord;
  if (existingFlow) {
    const [updated] = await db
      .update(flows)
      .set({
        graph: compiled.graph,
        name: compiled.flowName,
        description: `${descriptionPrefix} Automated editorial pipeline for ${page.name}`,
        executionRevision: existingFlow.executionRevision + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(flows.id, existingFlow.id), eq(flows.tenantId, tenantId)))
      .returning();
    flowRecord = updated;
  } else {
    const [created] = await db
      .insert(flows)
      .values({
        tenantId,
        name: compiled.flowName,
        description: `${descriptionPrefix} Automated editorial pipeline for ${page.name}`,
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
    .where(and(eq(themePages.id, themePageId), eq(themePages.tenantId, tenantId)));

  return {
    flow: flowRecord,
    compiled,
  };
}
