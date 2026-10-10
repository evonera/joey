import { themeMediaStorageReady } from "./runtime-readiness";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, contentPackages, r2CleanupTasks } from "@/lib/db/schema";
import { outboundRequest } from "@/lib/flows/outbound-request";
import { runReservedUpload } from "@/lib/flows/asset-registration";
import { uploadBufferToR2, deleteObjectWithRetry } from "@/lib/storage";
import { cancelR2Cleanup, enqueueR2Cleanup, rearmR2Cleanup } from "@/lib/storage-cleanup";
import { IMPORTABLE_MEDIA_RIGHTS, packageMediaCandidates } from "./source-media";

export function imageMime(bytes: Buffer): { mime: string; extension: string } {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mime: "image/png", extension: "png" };
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { mime: "image/jpeg", extension: "jpg" };
  if (["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString())) return { mime: "image/gif", extension: "gif" };
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") return { mime: "image/webp", extension: "webp" };
  throw new Error("Source media must be a PNG, JPEG, GIF or WebP image.");
}

/** Only URLs already discovered on this tenant's package can be imported. */
export async function importThemeSourceMedia(tenantId: string, packageId: string, candidateUrl: string, signal?: AbortSignal, operations: { request?: typeof outboundRequest; upload?: typeof uploadBufferToR2; remove?: typeof deleteObjectWithRetry } = {}) {
  const pkg = await db.query.contentPackages.findFirst({ where: and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)) });
  if (!pkg || !["pending_review", "failed", "rejected", "approved"].includes(pkg.status) || (pkg.metrics as any)?.publishAttemptAt || (pkg.metrics as any)?.zernioPostId) throw new Error("This package cannot be edited.");
  const candidate = packageMediaCandidates(pkg.provenance).find(item => item.url === candidateUrl);
  if (!candidate || !IMPORTABLE_MEDIA_RIGHTS.has(candidate.rightsCategory)) throw new Error("Choose source media with declared ownership or reuse rights.");
  const selected = (pkg.provenance as Record<string, unknown>).selectedMedia as { assetId?: string; url?: string } | undefined;
  if (selected?.url === candidateUrl && selected.assetId) {
    const existing = await db.query.assets.findFirst({ where: and(eq(assets.id, selected.assetId), eq(assets.tenantId, tenantId)) });
    if (existing && (pkg.metrics as any)?.renderSettings?.mediaAssetId === existing.id) return existing;
    if (existing) {
      const [changed] = await db.update(contentPackages).set({ status: "pending_review", renderedAssetUrls: [], error: null, updatedAt: new Date(), metrics: sql`(coalesce(${contentPackages.metrics}, '{}'::jsonb) - 'renderJobId' - 'renderRevision' - 'legacyRenderRevision' - 'legacyRenderToken') || jsonb_build_object('failurePhase', 'render_required', 'renderSettings', coalesce(${contentPackages.metrics}->'renderSettings', '{}'::jsonb) || ${JSON.stringify({ mediaAssetId: existing.id })}::jsonb)` }).where(and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId), sql`date_trunc('milliseconds', ${contentPackages.updatedAt}) = ${pkg.updatedAt.toISOString()}::timestamp`, sql`${contentPackages.provenance} = ${JSON.stringify(pkg.provenance)}::jsonb`, inArray(contentPackages.status, ["pending_review", "approved", "rejected", "failed"]), sql`${contentPackages.metrics}->>'publishAttemptAt' IS NULL`, sql`${contentPackages.metrics}->>'zernioPostId' IS NULL`)).returning({ id: contentPackages.id });
      if (!changed) throw new Error("Package changed before image selection was saved.");
      return existing;
    }
  }
  if (!operations.upload && !themeMediaStorageReady()) throw new Error("Connect asset storage and its public delivery URL before importing source media.");
  const response = await (operations.request ?? outboundRequest)(candidate.url, { signal, timeoutMs: 15000, maxBytes: 5 * 1024 * 1024, maxRedirects: 3 });
  if (response.status < 200 || response.status >= 300) throw new Error(`Source image returned HTTP ${response.status}.`);
  const { mime, extension } = imageMime(response.buffer);
  const digest = createHash("sha256").update(response.buffer).digest("hex");
  // A distinct reservation prevents concurrent import compensation from deleting
  // another import's object. Persisted selections make retries reuse the asset.
  const key = `${tenantId}/theme-studio/source/${digest}/${randomUUID()}.${extension}`;
  let uploaded: { publicUrl: string };
  return runReservedUpload({
    reserve: () => enqueueR2Cleanup(tenantId, key, "Source media awaiting package registration"),
    upload: async () => { uploaded = await (operations.upload ?? uploadBufferToR2)(response.buffer, mime, tenantId, { customKey: key, signal }); },
    register: () => db.transaction(async tx => {
      signal?.throwIfAborted();
      const [reservation] = await tx.select({ id: r2CleanupTasks.id }).from(r2CleanupTasks).where(and(eq(r2CleanupTasks.tenantId, tenantId), eq(r2CleanupTasks.key, key))).for("update");
      if (!reservation) throw new Error("Source media reservation expired.");
      const [asset] = await tx.insert(assets).values({ tenantId, key, publicUrl: uploaded.publicUrl, filename: `source-${digest.slice(0, 12)}.${extension}`, mimeType: mime, size: response.buffer.length, tags: ["theme-source"], altText: `${candidate.credit} · ${candidate.sourceUrl}` }).returning();
      const [changed] = await tx.update(contentPackages).set({
        status: "pending_review", renderedAssetUrls: [], error: null, updatedAt: new Date(),
        provenance: sql`coalesce(${contentPackages.provenance}, '{}'::jsonb) || ${JSON.stringify({ selectedMedia: { ...candidate, assetId: asset.id, assetVersion: key, sha256: digest, importedAt: new Date().toISOString() } })}::jsonb`,
        metrics: sql`(coalesce(${contentPackages.metrics}, '{}'::jsonb) - 'renderJobId' - 'renderRevision' - 'legacyRenderRevision' - 'legacyRenderToken') || jsonb_build_object('failurePhase', 'render_required', 'renderSettings', coalesce(${contentPackages.metrics}->'renderSettings', '{}'::jsonb) || ${JSON.stringify({ mediaAssetId: asset.id })}::jsonb)`,
      }).where(and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId),
        sql`date_trunc('milliseconds', ${contentPackages.updatedAt}) = ${pkg.updatedAt.toISOString()}::timestamp`, sql`${contentPackages.provenance} = ${JSON.stringify(pkg.provenance)}::jsonb`,
        inArray(contentPackages.status, ["pending_review", "approved", "rejected", "failed"]), sql`${contentPackages.metrics}->>'publishAttemptAt' IS NULL`, sql`${contentPackages.metrics}->>'zernioPostId' IS NULL`,
      )).returning({ id: contentPackages.id });
      if (!changed) throw new Error("Package changed during import. Select the image again.");
      await tx.delete(r2CleanupTasks).where(eq(r2CleanupTasks.id, reservation.id));
      return asset;
    }),
    compensate: async () => { await (operations.remove ?? deleteObjectWithRetry)(key); await cancelR2Cleanup(key); },
    rearm: () => rearmR2Cleanup(tenantId, key, "Source media import compensation required"),
  });
}
