import { createHash } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, contentPackages, mediaRenderJobs, socialAccounts, storyClusters, themeContentFormats, themePages, themeVisualTemplates } from "@/lib/db/schema";
import { validateThemeRenderSnapshot } from "@/lib/media-engine/validate-theme-render";
import { scoutFactReviewRequired } from "@/lib/scouts/fact-review";
import { matchingPackageAccounts, packageDestinationIds } from "./destinations";
import { buildThemePublicationPayload } from "./payload";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Holds the relevant rows until the caller commits its claim; never call a provider in this transaction. */
export async function lockedThemePreview(tx: Tx, tenantId: string, packageId: string, publishEarly: boolean) {
  const initial = await tx.query.contentPackages.findFirst({ where: and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)) });
  if (!initial) throw new Error("Package not found.");
  const [page] = await tx.select().from(themePages).where(and(eq(themePages.id, initial.themePageId), eq(themePages.tenantId, tenantId))).for("update");
  const [format] = await tx.select().from(themeContentFormats).where(and(eq(themeContentFormats.id, initial.formatId), eq(themeContentFormats.tenantId, tenantId))).for("update");
  if (!page || !format) throw new Error("Theme page or format is unavailable.");
  const [template] = initial.templateId ? await tx.select().from(themeVisualTemplates).where(and(eq(themeVisualTemplates.id, initial.templateId), eq(themeVisualTemplates.tenantId, tenantId))).for("update") : [];
  if (initial.templateId && !template) throw new Error("Theme template is unavailable.");
  const { selectedAccountIds, priorAccountId, lookupIds } = packageDestinationIds(initial.provenance, page.connectedAccounts, initial.metrics);
  if (!lookupIds.length) throw new Error("Select a connected account before publishing.");
  const lookupAccounts = await tx.select().from(socialAccounts).where(and(eq(socialAccounts.tenantId, tenantId), inArray(socialAccounts.id, lookupIds))).orderBy(asc(socialAccounts.id)).for("update");
  if (lookupAccounts.length !== lookupIds.length) throw new Error("A selected account is unavailable. Refresh and review destinations.");
  const [cluster] = initial.clusterId ? await tx.select().from(storyClusters).where(and(eq(storyClusters.id, initial.clusterId), eq(storyClusters.tenantId, tenantId))).for("update") : [];
  if (initial.clusterId && !cluster) throw new Error("The source story is unavailable.");
  const metrics = initial.metrics as Record<string, unknown> | null;
  const jobId = typeof metrics?.renderJobId === "string" ? metrics.renderJobId : undefined;
  const [job] = jobId ? await tx.select().from(mediaRenderJobs).where(and(eq(mediaRenderJobs.id, jobId), eq(mediaRenderJobs.tenantId, tenantId))).for("update") : [];
  if (jobId && !job) throw new Error("Render not found.");
  const [output] = job?.outputAssetId ? await tx.select().from(assets).where(and(eq(assets.id, job.outputAssetId), eq(assets.tenantId, tenantId))).for("update") : [];
  const [pkg] = await tx.select().from(contentPackages).where(and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId))).for("update");
  if (!pkg || JSON.stringify(pkg) !== JSON.stringify(initial)) throw new Error("The package changed. Refresh and review it.");
  if (scoutFactReviewRequired(pkg.provenance)) throw new Error("Source claims need human fact review before publication.");
  validateThemeRenderSnapshot({ pkg, page, format, template, cluster, job, output });
  const accounts = matchingPackageAccounts(lookupAccounts, format.platform, selectedAccountIds, priorAccountId);
  if (!accounts.length) throw new Error("No selected active account matches the format.");
  const payload = buildThemePublicationPayload(pkg, format, accounts, publishEarly, new Date());
  if (!payload.mediaItems.length || payload.mediaItems.some(item => { try { return new URL(item.url).protocol !== "https:"; } catch { return true; } })) throw new Error("Publishing requires publicly reachable HTTPS media.");
  if (format.platform === "tiktok" && payload.mediaItems.some(item => item.type !== "video")) throw new Error("TikTok publishing requires a rendered video asset.");
  const identity = accounts.map(a => ({ id: a.id, accountName: a.accountName, platform: a.platform, platformAccountId: a.platformAccountId }));
  const fingerprint = createHash("sha256").update(JSON.stringify({ pkg, page, format, template, cluster, job, output, lookupAccounts, payload, publishEarly })).digest("hex");
  return { pkg, format, accounts, payload, fingerprint, identity };
}
