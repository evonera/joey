import type {
  IPlatformProvider,
  PlatformAccountCredentials,
  ContentLimits,
  ContainerCreationResult,
  ContainerStatusResult,
  PublishFinalizeResult,
} from "../platform-provider";

export class InstagramProvider implements IPlatformProvider {
  readonly platform = "instagram";

  getLimits(): ContentLimits {
    return {
      maxCaptionLength: 2200,
      maxHashtags: 30,
      allowedAspectRatios: ["1:1", "4:5", "9:16"],
      maxCarouselSlides: 10,
      supportsVideo: true,
    };
  }

  validateContent(caption: string, mediaUrls: string[], mediaType: string): { valid: boolean; errors: string[] } {
    const limits = this.getLimits();
    const errors: string[] = [];

    if (caption.length > limits.maxCaptionLength) {
      errors.push(`Caption exceeds Instagram limit of ${limits.maxCaptionLength} characters (got ${caption.length}).`);
    }

    if (mediaType === "carousel" && mediaUrls.length > limits.maxCarouselSlides) {
      errors.push(`Carousel exceeds Instagram max of ${limits.maxCarouselSlides} slides (got ${mediaUrls.length}).`);
    }

    if (mediaUrls.length === 0) {
      errors.push("Instagram post requires at least one media asset.");
    }

    return { valid: errors.length === 0, errors };
  }

  async createMediaContainer(
    account: PlatformAccountCredentials,
    mediaUrls: string[],
    mediaType: string
  ): Promise<ContainerCreationResult> {
    const containerId = `ig_cnt_${crypto.randomUUID().slice(0, 12)}`;
    // In production, calls Graph API POST /{ig-user-id}/media
    return {
      containerId,
      status: "READY",
    };
  }

  async pollContainerStatus(
    account: PlatformAccountCredentials,
    containerId: string
  ): Promise<ContainerStatusResult> {
    // In production, queries GET /{container-id}?fields=status_code
    return {
      containerId,
      status: "READY",
      statusCode: "FINISHED",
    };
  }

  async finalizePublish(
    account: PlatformAccountCredentials,
    containerId: string,
    caption: string
  ): Promise<PublishFinalizeResult> {
    // In production, calls POST /{ig-user-id}/media_publish?creation_id={containerId}
    const publishedPostId = `ig_post_${crypto.randomUUID().slice(0, 14)}`;
    return {
      publishedPostId,
      publishedUrl: `https://instagram.com/p/${publishedPostId}`,
      success: true,
    };
  }
}
