import { CURATED_MEME_CLIPS } from "@/lib/theme-studio/assets/meme-clips";
import { isR2Configured, buildPublicClipUrl } from "@/lib/storage";

async function main() {
  console.log("🎬 Joey Curated Viral Clips & Meme Sourcing Engine");
  console.log("=================================================");
  console.log(`Loaded ${CURATED_MEME_CLIPS.length} curated clips in library.\n`);

  const categories = new Map<string, number>();
  for (const clip of CURATED_MEME_CLIPS) {
    categories.set(clip.category, (categories.get(clip.category) || 0) + 1);
  }

  console.log("Category breakdown:");
  for (const [cat, count] of categories.entries()) {
    console.log(`  • ${cat.padEnd(15)} : ${count} clips`);
  }

  console.log("\nSample Clip Directory (Cloudflare R2 Paths):");
  for (const clip of CURATED_MEME_CLIPS) {
    console.log(`  [${clip.category}] ${clip.title}`);
    if (clip.quote) console.log(`      Quote: "${clip.quote}" (${clip.speaker || "Unknown"})`);
    console.log(`      URL:   ${clip.videoUrl}`);
  }

  const r2Status = isR2Configured();
  console.log("\nCloudflare R2 Status:", r2Status ? "✅ Configured" : "⚠️ Missing R2 environment variables (using public CDN fallback)");
  console.log("Finished indexing curated clips.");
}

main().catch((err) => {
  console.error("Error in seed-curated-clips:", err);
  process.exit(1);
});
