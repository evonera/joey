import { z } from "zod";

export const manualPostSchema = z.object({
  draftId: z.string().min(1).max(128).optional(),
  content: z.string().max(50_000),
  mediaUrls: z.array(z.url().refine(value => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  }, "Use an HTTP or HTTPS media URL without credentials.")).max(10),
  accountIds: z.array(z.string().min(1).max(128)).min(1, "Select at least one account.").max(30)
    .refine(ids => new Set(ids).size === ids.length, "Select each account only once."),
  scheduleType: z.enum(["now", "scheduled", "draft"]),
  scheduledFor: z.iso.datetime({ offset: true }).optional(),
}).superRefine((data, ctx) => {
  if (!data.content.trim() && !data.mediaUrls.length) ctx.addIssue({ code: "custom", message: "Add post content or media." });
  if (data.scheduleType === "scheduled" && (!data.scheduledFor || Date.parse(data.scheduledFor) <= Date.now())) {
    ctx.addIssue({ code: "custom", message: "Select a future date and time." });
  }
  if (data.draftId && data.accountIds.length !== 1) ctx.addIssue({ code: "custom", message: "An existing draft belongs to one account. Select one account to update it." });
});

export const COMPOSE_PLATFORM_LIMITS: Record<string, { label: string; limit: number; maxMedia: number }> = {
  x: { label: "X", limit: 280, maxMedia: 4 },
  twitter: { label: "X", limit: 280, maxMedia: 4 },
  threads: { label: "Threads", limit: 500, maxMedia: 10 },
  bluesky: { label: "Bluesky", limit: 300, maxMedia: 4 },
  linkedin: { label: "LinkedIn", limit: 3000, maxMedia: 9 },
  instagram: { label: "Instagram", limit: 2200, maxMedia: 10 },
  facebook: { label: "Facebook", limit: 50000, maxMedia: 10 },
  tiktok: { label: "TikTok", limit: 2200, maxMedia: 1 },
  youtube: { label: "YouTube", limit: 5000, maxMedia: 1 },
};

export function validatePostForPlatforms(content: string, mediaUrls: string[], platforms: string[]) {
  for (const platform of platforms) {
    const limits = COMPOSE_PLATFORM_LIMITS[platform];
    if (limits && content.length > limits.limit) return `${limits.label} allows up to ${limits.limit} characters in this composer.`;
    if (limits && mediaUrls.length > limits.maxMedia) return `${limits.label} allows up to ${limits.maxMedia} media attachments in this composer.`;
    if (["instagram", "tiktok", "youtube", "pinterest"].includes(platform) && !mediaUrls.length) return `${platform} requires a media attachment.`;
  }
  return null;
}
