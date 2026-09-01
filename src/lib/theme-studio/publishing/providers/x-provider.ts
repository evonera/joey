import type {
  IPlatformProvider,
  PlatformAccountCredentials,
  ContentLimits,
  ContainerCreationResult,
  ContainerStatusResult,
  PublishFinalizeResult,
} from "../platform-provider";

export class XProvider implements IPlatformProvider {
  readonly platform = "x";

  getLimits(): ContentLimits {
    return {
      maxCaptionLength: 280,
      maxHashtags: 5,
      allowedAspectRatios: ["16:9", "1:1"],
      maxCarouselSlides: 4,
      supportsVideo: true,
    };
  }

  validateContent(caption: string, mediaUrls: string[], mediaType: string): { valid: boolean; errors: string[] } {
    const limits = this.getLimits();
    const errors: string[] = [];

    if (caption.length > limits.maxCaptionLength) {
      errors.push(`Post exceeds X limit of ${limits.maxCaptionLength} characters (got ${caption.length}). Consider concise trimming.`);
    }

    if (mediaUrls.length > limits.maxCarouselSlides) {
      errors.push(`X supports a maximum of ${limits.maxCarouselSlides} attached images.`);
    }

    return { valid: errors.length === 0, errors };
  }

  async createMediaContainer(
    account: PlatformAccountCredentials,
    mediaUrls: string[],
    mediaType: string
  ): Promise<ContainerCreationResult> {
    const containerId = `x_media_${crypto.randomUUID().slice(0, 12)}`;
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
      statusCode: "SUCCEEDED",
    };
  }

  async finalizePublish(
    account: PlatformAccountCredentials,
    containerId: string,
    caption: string
  ): Promise<PublishFinalizeResult> {
    const publishedPostId = `x_tweet_${crypto.randomUUID().slice(0, 14)}`;
    return {
      publishedPostId,
      publishedUrl: `https://x.com/user/status/${publishedPostId}`,
      success: true,
    };
  }
}
