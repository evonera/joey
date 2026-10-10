import { z } from "zod";

const color = z.string().trim().regex(/^(?:#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%+-]+\)|[a-z]{3,20})$/i);
const url = z.union([z.literal(""), z.url().max(4096).refine(value => /^https?:\/\//i.test(value), "Use an HTTP or HTTPS media URL")]);
const author = z.object({ name: z.string().max(120), handle: z.string().max(120), avatarUrl: url.optional(), isVerified: z.boolean().optional() }).strict();

/** Canonical editor + saved-template contract. Legacy aliases are read once. */
export const themeDesignSchema = z.object({
  templateFamily: z.enum(["pubity_hero", "morning_brew_cyan", "pubity_carousel", "tweet_card", "tweet_grid4", "video_reel", "mixed_carousel", "branded_clip", "minimal_meme", "photo_headline", "photo_inset"]).optional(),
  backgroundColor: color.optional(), textColor: color.optional(), accentColor: color.optional(),
  backgroundGradient: z.string().trim().regex(/^linear-gradient\([\d\s.,%#a-z()+-]{1,300}\)$/i).optional(),
  bgImageUrl: url.optional(), bgType: z.enum(["photo", "solid", "gradient"]).optional(),
  fontFamily: z.enum(["Inter", "Anton"]).optional(),
  titleSize: z.number().min(18).max(72).optional(), bodySize: z.number().min(12).max(40).optional(),
  padding: z.number().min(0).max(160).optional(), borderRadius: z.number().min(0).max(100).optional(),
  showWatermark: z.boolean().optional(), showSlideIndicator: z.boolean().optional(), showDivider: z.boolean().optional(),
  watermarkText: z.string().max(500).optional(), watermarkBackdropText: z.string().max(500).optional(),
  titleTemplate: z.string().max(500).optional(), bodyTemplate: z.string().max(500).optional(),
  topBadge: z.enum(["yellow_logo", "swipe_pill", "tag_pill", "circular_seal", "none"]).optional(),
  brandInitial: z.string().max(5).optional(), pipInsetUrl: url.optional(),
  highlightWords: z.array(z.string().trim().min(1).max(100)).max(40).optional(),
  videoUrl: url.optional(), memeClipId: z.string().max(128).optional(),
  mediaUrls: z.array(url).max(4).optional(), mediaLayout: z.enum(["single", "2-column", "4-grid", "none"]).optional(),
  tweetAuthor: author.optional(), quotedTweet: z.object({ author, content: z.string().max(5000), mediaUrl: url.optional() }).strict().optional(),
}).strict();
export type ThemeDesignSpec = z.infer<typeof themeDesignSchema>;

export function normalizeThemeDesign(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const value = { ...input } as Record<string, unknown>;
  for (const [oldKey, canonical] of [["imageUrl", "bgImageUrl"], ["highlightKeywords", "highlightWords"], ["showDividerMark", "showDivider"]]) {
    if (value[canonical] === undefined && value[oldKey] !== undefined) value[canonical] = value[oldKey];
    delete value[oldKey];
  }
  if (typeof value.fontFamily === "string") {
    if (/\b(?:Anton|Impact|Bebas|Bangers)\b/i.test(value.fontFamily)) value.fontFamily = "Anton";
    else if (/\b(?:Inter|Arial|Helvetica|Montserrat|system-ui|sans-serif)\b/i.test(value.fontFamily)) value.fontFamily = "Inter";
  }
  if (value.backgroundGradient === "" || value.backgroundGradient === null) delete value.backgroundGradient;
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

export function parseThemeDesign(input: unknown): ThemeDesignSpec {
  return themeDesignSchema.parse(normalizeThemeDesign(input));
}

export const themeRenderSettingsSchema = z.object({
  mediaAssetId: z.uuid(), insetEnabled: z.boolean().optional(), insetAssetId: z.uuid().optional(), musicAssetId: z.uuid().optional(),
  templateFamily: z.enum(["branded_clip", "minimal_meme", "photo_headline", "photo_inset"]),
  cropMode: z.enum(["contain", "cover"]), cropX: z.number().min(0).max(1).default(.5), cropY: z.number().min(0).max(1).default(.5),
  durationSeconds: z.number().min(1).max(60), trimStart: z.number().min(0).max(86400),
  captions: z.boolean().default(false), zoom: z.number().min(1).max(1.15), sourceAudio: z.boolean().default(true),
}).strict();
export type ThemeRenderSettings = z.infer<typeof themeRenderSettingsSchema>;
