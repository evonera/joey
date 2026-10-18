import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentPackages } from "@/lib/db/schema";
import { outboundRequest } from "@/lib/flows/outbound-request";
import { IMPORTABLE_MEDIA_RIGHTS, packageMediaCandidates, sourceMediaCandidates, type SourceMediaCandidate } from "./source-media";
import { publicReferenceUrl } from "./feed-parser";
import { isPublicScoutHttpsUrl } from "@/lib/scouts/source-validation";

export function publicMediaLink(value: string) {
  const url = publicReferenceUrl(value);
  if (!url) return undefined;
  const test = new URL(url); test.protocol = "https:";
  return isPublicScoutHttpsUrl(test.toString()) ? url : undefined;
}

function decode(value: string) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#39|#34);/g, entity => ({ "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">", "&#39;": "'", "&#34;": '"' })[entity]!);
}

/** Metadata only. Every import revalidates and pins the selected media URL. */
export function directLinkCandidates(html: string, sourceUrl: string, rights: string) {
  const imageLinks: string[] = [], videoLinks: string[] = [];
  for (const tag of html.match(/<(?:meta|video|source)\b[^>]{0,4096}>/gi) ?? []) {
    const attrs: Record<string, string> = {};
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[match[1].toLowerCase()] = decode(match[2] ?? match[3]);
    const property = (attrs.property ?? attrs.name ?? "").toLowerCase();
    const value = attrs.content ?? attrs.src;
    if (!value) continue;
    let url: string | undefined;
    try { url = publicMediaLink(new URL(value, sourceUrl).toString()); } catch { continue; }
    if (!url) continue;
    if (["og:image", "og:image:url", "og:image:secure_url", "twitter:image"].includes(property)) imageLinks.push(url);
    else if (["og:video", "og:video:url", "og:video:secure_url"].includes(property) || /^<(?:video|source)\b/i.test(tag)) videoLinks.push(url);
  }
  return sourceMediaCandidates({ imageLinks, videoLinks }, sourceUrl, rights);
}

export async function discoverThemePackageLink(tenantId: string, packageId: string, input: { url: string; rightsCategory: string }, signal?: AbortSignal) {
  if (!IMPORTABLE_MEDIA_RIGHTS.has(input.rightsCategory)) throw new Error("Choose the ownership or reuse rights for this media.");
  const url = publicMediaLink(input.url.trim());
  if (!url || input.url.length > 2048) throw new Error("Enter a public media or post URL.");
  const pkg = await db.query.contentPackages.findFirst({ where: and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)) });
  if (!pkg || !["pending_review", "failed", "rejected"].includes(pkg.status) || (pkg.metrics as any)?.publishAttemptAt || (pkg.metrics as any)?.zernioPostId) throw new Error("This package cannot be edited.");
  const head = await outboundRequest(url, { signal, timeoutMs: 10000, maxBytes: 64 * 1024 * 1024, maxRedirects: 3, method: "HEAD" });
  const headType = String(head.headers["content-type"] ?? "")?.split(";")[0].trim().toLowerCase() ?? "";
  const direct = head.status >= 200 && head.status < 300 && (headType.startsWith("image/") || ["video/mp4", "video/webm"].includes(headType));
  const response = direct ? head : await outboundRequest(url, { signal, timeoutMs: 20000, maxBytes: 2 * 1024 * 1024, maxRedirects: 3, method: "GET", headers: { Accept: "text/html" } });
  if (response.status < 200 || response.status >= 300) throw new Error(`Source link returned HTTP ${response.status}.`);
  const type = String(response.headers["content-type"] ?? "")?.split(";")[0].trim().toLowerCase() ?? "";
  const candidates = type.startsWith("image/") || ["video/mp4", "video/webm"].includes(type)
    ? sourceMediaCandidates({ mediaCandidates: [{ url: response.finalUrl, kind: type.startsWith("video/") ? "video" : "image" }] }, url, input.rightsCategory)
    : directLinkCandidates(response.buffer.toString("utf8"), response.finalUrl, input.rightsCategory);
  if (!candidates.length) throw new Error("This link exposes no downloadable image or video. Use the local connector for a supported social post, or upload the media in Assets.");
  await saveThemePackageCandidates(tenantId, packageId, candidates, pkg);
  return candidates;
}

export async function saveThemePackageCandidates(tenantId: string, packageId: string, candidates: SourceMediaCandidate[], previous?: typeof contentPackages.$inferSelect) {
  const pkg = previous ?? await db.query.contentPackages.findFirst({ where: and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId)) });
  if (!pkg || pkg.tenantId !== tenantId || pkg.id !== packageId || !["pending_review", "failed", "rejected"].includes(pkg.status) || (pkg.metrics as any)?.publishAttemptAt || (pkg.metrics as any)?.zernioPostId) throw new Error("This package cannot be edited.");
  if (!candidates.length || candidates.some(item => !publicMediaLink(item.url) || !publicMediaLink(item.sourceUrl) || !IMPORTABLE_MEDIA_RIGHTS.has(item.rightsCategory))) throw new Error("Use public media URLs with declared reuse rights.");
  const merged = [...new Map([...candidates, ...packageMediaCandidates(pkg.provenance)].map(item => [item.url, item])).values()].slice(0, 8);
  const [changed] = await db.update(contentPackages).set({
    provenance: sql`coalesce(${contentPackages.provenance}, '{}'::jsonb) || ${JSON.stringify({ mediaCandidates: merged })}::jsonb`, updatedAt: new Date(),
  }).where(and(eq(contentPackages.id, packageId), eq(contentPackages.tenantId, tenantId),
    sql`date_trunc('milliseconds', ${contentPackages.updatedAt}) = ${pkg.updatedAt.toISOString()}::timestamp`,
    inArray(contentPackages.status, ["pending_review", "failed", "rejected"]),
    sql`${contentPackages.metrics}->>'publishAttemptAt' IS NULL`, sql`${contentPackages.metrics}->>'zernioPostId' IS NULL`
  )).returning({ id: contentPackages.id });
  if (!changed) throw new Error("Package changed while the link was being inspected. Refresh and try again.");
}
