import { z } from "zod";

const candidateSchema = z.object({
  url: z.url().max(4096).refine(value => /^https?:\/\//i.test(value)),
  sourceUrl: z.url().max(4096), rightsCategory: z.string().max(30),
  credit: z.string().max(500), kind: z.enum(["image", "video"]),
}).strict();
export type SourceMediaCandidate = z.infer<typeof candidateSchema>;
export const IMPORTABLE_MEDIA_RIGHTS = new Set(["owned", "public_domain", "cc_by", "cc_by_sa", "commercial_license"]);

/** Discovery is metadata only; importing bytes is a separate, rights checked step. */
export function sourceMediaCandidates(metadata: unknown, sourceUrl: string, rightsCategory: string): SourceMediaCandidate[] {
  const data = metadata && typeof metadata === "object" ? metadata as Record<string, unknown> : {};
  const links = [{ url: data.heroImage, kind: "image" }, ...(Array.isArray(data.imageLinks) ? data.imageLinks.map(url => ({ url, kind: "image" })) : []), ...(Array.isArray(data.videoLinks) ? data.videoLinks.map(url => ({ url, kind: "video" })) : []), ...(Array.isArray(data.mediaCandidates) ? data.mediaCandidates.map(item => typeof item === "object" && item ? item : { url: item, kind: "image" }) : [])];
  let hostname: string;
  try { hostname = new URL(sourceUrl).hostname; } catch { return []; }
  const seen = new Set<string>();
  return links.flatMap(value => {
    const item = value as Record<string, unknown>;
    const link = item.url;
    if (typeof link !== "string") return [];
    let url: string;
    try { url = new URL(link.replaceAll("&amp;", "&"), sourceUrl).toString(); } catch { return []; }
    const parsed = candidateSchema.safeParse({ url, sourceUrl, rightsCategory, credit: typeof data.author === "string" ? data.author : hostname, kind: item.kind === "video" ? "video" : "image" });
    if (!parsed.success || seen.has(url)) return [];
    seen.add(url);
    return [parsed.data];
  }).slice(0, 8);
}

export function packageMediaCandidates(provenance: unknown): SourceMediaCandidate[] {
  const value = provenance && typeof provenance === "object" ? provenance as Record<string, unknown> : {};
  const candidates = Array.isArray(value.mediaCandidates) ? value.mediaCandidates : [];
  return candidates.flatMap(item => { const parsed = candidateSchema.safeParse(item); return parsed.success ? [parsed.data] : []; }).slice(0, 8);
}
