import { getMemeClipById } from "@/lib/theme-studio/assets/meme-clips";

const CURATED_PREFIX = "curated:";

export function curatedAssetRef(clipId: string) {
  const clip = getMemeClipById(clipId);
  if (!clip) throw new Error("Curated clip is no longer available.");
  const pathname = new URL(clip.videoUrl).pathname.replace(/^\/+/, "");
  if (!pathname.startsWith("public-clips/") || pathname.includes("..")) {
    throw new Error("Curated clip has an invalid storage key.");
  }
  return { id: `${CURATED_PREFIX}${clip.id}`, version: pathname };
}

export function isCuratedAssetRef(ref: { id: string; version: string }): boolean {
  if (!ref.id.startsWith(CURATED_PREFIX)) return false;
  const clipId = ref.id.slice(CURATED_PREFIX.length);
  try {
    const expected = curatedAssetRef(clipId);
    return expected.version === ref.version;
  } catch {
    return false;
  }
}
