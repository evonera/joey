import type {
  IPlatformProvider,
  PlatformAccountCredentials,
  ContentLimits,
  ContainerCreationResult,
  ContainerStatusResult,
  PublishFinalizeResult,
} from "../platform-provider";

export class TikTokProvider implements IPlatformProvider {
  readonly platform = "tiktok";

  getLimits(): ContentLimits {
    return {
      maxCaptionLength: 4000,
      maxHashtags: 20,
      allowedAspectRatios: ["9:16"],
      maxCarouselSlides: 1,
      supportsVideo: true,
    };
  }

  validateContent(caption: string, mediaUrls: string[], mediaType: string): { valid: boolean; errors: string[] } {
    const limits = this.getLimits();
    const errors: string[] = [];

    if (mediaType !== "video") {
      errors.push("TikTok publishing currently requires vertical short video media.");
    }

    if (caption.length > limits.maxCaptionLength) {
      errors.push(`Caption exceeds TikTok limit of ${limits.maxCaptionLength} characters.`);
    }

    return { valid: errors.length === 0, errors };
  }

  async createMediaContainer(
    account: PlatformAccountCredentials,
    mediaUrls: string[],
    mediaType: string
  ): Promise<ContainerCreationResult> {
    const containerId = `tt_cnt_${crypto.randomUUID().slice(0, 12)}`;
    return {
      containerId,
      status: "READY",
    };
  }

  async pollContainerStatus(
    account: PlatformAccountCredentials,
    containerId: string
  ): Promise<ContainerStatusResult> {
    return {
      containerId,
      status: "READY",
      statusCode: "SUCCESS",
    };
  }

  async finalizePublish(
    account: PlatformAccountCredentials,
    containerId: string,
    caption: string
  ): Promise<PublishFinalizeResult> {
    const publishedPostId = `tt_video_${crypto.randomUUID().slice(0, 14)}`;
    return {
      publishedPostId,
      publishedUrl: `https://tiktok.com/@user/video/${publishedPostId}`,
      success: true,
    };
  }
}
