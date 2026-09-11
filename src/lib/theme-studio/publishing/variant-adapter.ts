export interface PlatformVariant {
  platform: string;
  adaptedCaption: string;
  adaptedHashtags: string[];
  mediaUrls: string[];
  mediaType: string;
}

/**
 * Transforms a generic content package into a platform-compliant variant.
 */
export function adaptPackageForPlatform(
  pkg: {
    title: string;
    caption?: string | null;
    hashtags?: string[] | null;
    renderedAssetUrls?: any;
  },
  platform: "instagram" | "tiktok" | "x",
  mediaType: "image" | "carousel" | "video" = "image"
): PlatformVariant {
  const rawCaption = pkg.caption || pkg.title;
  const rawHashtags = pkg.hashtags || [];

  const mediaUrls: string[] = Array.isArray(pkg.renderedAssetUrls)
    ? pkg.renderedAssetUrls.filter((asset: unknown) => {
        const url = typeof asset === "string" ? asset : asset && typeof asset === "object" && "url" in asset ? asset.url : undefined;
        if (typeof url !== "string") return false;
        const type = typeof asset === "object" && asset && "type" in asset ? asset.type : /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url) ? "video" : "image";
        return mediaType === "video" ? type === "video" : type === "image";
      }).map((a: any) => (typeof a === "string" ? a : a.url)).filter(Boolean)
    : [];

  if (platform === "x") {
    // Truncate to fit within 280 characters with top 2 hashtags
    const topHashtags = rawHashtags.slice(0, 2).join(" ");
    const availableChars = 275 - (topHashtags ? topHashtags.length + 1 : 0);

    let shortBody = rawCaption.split("\n")[0];
    if (shortBody.length > availableChars) {
      shortBody = shortBody.slice(0, availableChars - 3) + "...";
    }

    const adaptedCaption = topHashtags ? `${shortBody}\n\n${topHashtags}` : shortBody;

    return {
      platform: "x",
      adaptedCaption,
      adaptedHashtags: rawHashtags.slice(0, 2),
      mediaUrls: mediaUrls.slice(0, 4), // max 4 images on X
      mediaType: mediaType === "carousel" ? "image" : mediaType,
    };
  }

  if (platform === "tiktok") {
    const topHashtags = rawHashtags.slice(0, 5).join(" ");
    const adaptedCaption = `${rawCaption}${topHashtags ? `\n\n${topHashtags}` : ""}`;

    return {
      platform: "tiktok",
      adaptedCaption,
      adaptedHashtags: rawHashtags.slice(0, 5),
      mediaUrls: mediaUrls.slice(0, 1),
      // Adapting copy cannot turn an image into a video. The publisher rejects
      // non-video TikTok packages until the video renderer produces an MP4.
      mediaType,
    };
  }

  // Instagram Default
  const isCarousel = mediaType === "carousel" || mediaUrls.length > 1;
  const swipeCallout = isCarousel ? "\n\nSwipe left for the breakdown." : "";
  const hashtagBlock = rawHashtags.length > 0 ? `\n\n${rawHashtags.join(" ")}` : "";
  const adaptedCaption = `${rawCaption}${swipeCallout}${hashtagBlock}`;

  return {
    platform: "instagram",
    adaptedCaption,
    adaptedHashtags: rawHashtags,
    mediaUrls: mediaUrls.slice(0, 10), // max 10 for IG
    mediaType,
  };
}
