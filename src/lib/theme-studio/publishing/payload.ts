import { adaptPackageForPlatform } from "./variant-adapter";
import { zernioPlatform } from "./destinations";

type Package = { id: string; themePageId: string; title: string; caption: string | null; hashtags: string[] | null; renderedAssetUrls: unknown; scheduledFor: Date | null };
type Account = { platform: string; platformAccountId: string };
const adapterPlatform = (platform: string) => (platform === "twitter" ? "x" : platform) as "instagram" | "tiktok" | "x";

/** Build the exact provider payload so previews and submission share the same transformations. */
export function buildThemePublicationPayload(pkg: Package, format: { platform: string; mediaType: string }, accounts: Account[], publishEarly: boolean, now: Date) {
  const variant = adaptPackageForPlatform(pkg, adapterPlatform(format.platform), format.mediaType as "image" | "carousel" | "video");
  return {
    title: pkg.title,
    content: variant.adaptedCaption,
    mediaItems: variant.mediaUrls.map(url => ({ type: variant.mediaType === "video" ? "video" as const : "image" as const, url, altText: variant.mediaType === "video" ? undefined : pkg.title })),
    platforms: accounts.map(account => ({ platform: zernioPlatform(account.platform), accountId: account.platformAccountId, customContent: adaptPackageForPlatform(pkg, adapterPlatform(account.platform), format.mediaType as "image" | "carousel" | "video").adaptedCaption })),
    hashtags: variant.adaptedHashtags,
    ...(!publishEarly && pkg.scheduledFor && pkg.scheduledFor > now ? { scheduledFor: pkg.scheduledFor.toISOString() } : { publishNow: true as const }),
    metadata: { themePageId: pkg.themePageId, themePackageId: pkg.id },
  };
}
