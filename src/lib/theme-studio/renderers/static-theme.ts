import { renderCardSvg, renderCarouselSlideSvgs, type CardRenderOptions } from "./static-card-renderer";
import { renderTweetCardSvg, type TweetCardRenderOptions } from "./tweet-card-renderer";

export function designBrandKit(brand: Record<string, unknown>, component: Record<string, unknown>): NonNullable<CardRenderOptions["brandKit"]> {
  return { ...brand, templatePreset: component.templateFamily, logoMonogram: component.brandInitial,
    backgroundGradient: component.backgroundGradient, bgType: component.bgType,
    primaryColor: component.backgroundColor ?? brand.primaryColor, accentColor: component.accentColor ?? brand.accentColor,
    textColor: component.textColor ?? brand.textColor, fontFamily: component.fontFamily ?? brand.fontFamily,
    titleSize: component.titleSize ?? brand.titleSize, bodySize: component.bodySize ?? brand.bodySize,
    showWatermark: component.showWatermark ?? brand.showWatermark, watermark: component.watermarkText ?? brand.watermark,
    showSlideIndicator: component.showSlideIndicator, padding: component.padding, borderRadius: component.borderRadius,
  } as NonNullable<CardRenderOptions["brandKit"]>;
}

/** Used by both the editor's export preview and the package PNG exporter. */
export function renderStaticThemeSvgs(input: {
  component: Record<string, unknown>; brandKit: NonNullable<CardRenderOptions["brandKit"]>;
  title: string; body: string; sourceName: string; pageName: string; heroImage?: string;
  mediaType: string; slug?: string; aspectRatio?: string | null; facts?: Array<{ claim: string }>;
}) {
  const { component, brandKit, title, body, heroImage } = input;
  const highlightWords = component.highlightWords as string[] | undefined;
  if (input.mediaType === "video" || component.templateFamily === "video_reel") throw new Error("Review the finished MP4 in the package queue for video templates.");
  if (component.templateFamily === "mixed_carousel") throw new Error("Mixed video carousels are not enabled yet.");
  if (input.mediaType === "carousel") return renderCarouselSlideSvgs([
    { title, body: body.slice(0, 200), tag: "COVER", sourceName: input.sourceName, imageUrl: heroImage, highlightWords },
    ...(input.facts ?? []).slice(0, 3).map((fact, index) => ({ title: `Key takeaway #${index + 1}`, body: fact.claim, tag: `POINT ${index + 1}`, imageUrl: heroImage, pipInsetUrl: component.pipInsetUrl as string | undefined, highlightWords })),
    { title: "Follow for daily updates", body: "Turn on notifications for more content like this.", tag: "FOLLOW", imageUrl: heroImage, isOutroSlide: true, outroWatermarkText: component.watermarkBackdropText as string | undefined },
  ], brandKit, input.aspectRatio === "4:5" ? "4:5" : "1:1", { topBadge: component.topBadge as CardRenderOptions["topBadge"], showDivider: component.showDivider as boolean | undefined });
  if (["tweet_card", "tweet_grid4"].includes(String(component.templateFamily)) || input.slug?.includes("tweet")) return [renderTweetCardSvg({
    author: component.tweetAuthor as TweetCardRenderOptions["author"] ?? { name: input.pageName, handle: brandKit.watermark ?? `@${input.pageName.toLowerCase().replace(/\s+/g, "")}` },
    content: title, mediaUrls: Array.isArray(component.mediaUrls) && component.mediaUrls.length ? component.mediaUrls as string[] : heroImage ? [heroImage] : [],
    mediaLayout: component.mediaLayout as TweetCardRenderOptions["mediaLayout"], quotedTweet: component.quotedTweet as TweetCardRenderOptions["quotedTweet"],
    aspectRatio: (input.aspectRatio ?? "4:5") as TweetCardRenderOptions["aspectRatio"], brandKit,
  })];
  return [renderCardSvg({ title, body: body.slice(0, 240), tag: "UPDATE", sourceName: input.sourceName, brandKit, imageUrl: heroImage,
    ...(component.cropMode ? { crop: { mode: component.cropMode === "contain" ? "contain" : "cover", x: Number(component.cropX ?? .5), y: Number(component.cropY ?? .5) } } : {}),
    topBadge: component.topBadge as CardRenderOptions["topBadge"], showDividerMark: component.showDivider as boolean | undefined,
    pipInsetUrl: component.pipInsetUrl as string | undefined, highlightWords, aspectRatio: (input.aspectRatio ?? "1:1") as CardRenderOptions["aspectRatio"],
  })];
}
