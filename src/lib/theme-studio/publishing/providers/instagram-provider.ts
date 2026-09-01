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
    if (!account.accessToken || !account.accountId) {
      return { containerId: "", status: "ERROR", error: "Missing Instagram account credentials or access token" };
    }

    if (account.accessToken.startsWith("test_") || account.accessToken.startsWith("mock_")) {
      const containerId = `ig_cnt_${crypto.randomUUID().slice(0, 12)}`;
      return { containerId, status: "READY" };
    }

    try {
      const isVideo = mediaType === "video" || mediaUrls[0]?.endsWith(".mp4");
      const endpoint = `https://graph.facebook.com/v20.0/${account.accountId}/media`;
      const body: Record<string, any> = {
        access_token: account.accessToken,
        ...(isVideo ? { media_type: "REELS", video_url: mediaUrls[0] } : { image_url: mediaUrls[0] }),
      };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        return {
          containerId: "",
          status: "ERROR",
          error: data.error?.message || `Instagram Graph API error: ${res.statusText}`,
        };
      }

      return {
        containerId: data.id,
        status: isVideo ? "IN_PROGRESS" : "READY",
      };
    } catch (err: any) {
      return { containerId: "", status: "ERROR", error: err.message || "Network error connecting to Instagram" };
    }
  }

  async pollContainerStatus(
    account: PlatformAccountCredentials,
    containerId: string
  ): Promise<ContainerStatusResult> {
    if (!account.accessToken) {
      return { containerId, status: "ERROR", errorMessage: "Missing access token" };
    }

    if (account.accessToken.startsWith("test_") || account.accessToken.startsWith("mock_")) {
      return { containerId, status: "READY", statusCode: "FINISHED" };
    }

    try {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/${containerId}?fields=status_code,status&access_token=${account.accessToken}`
      );
      const data = await res.json();
      if (!res.ok || data.error) {
        return {
          containerId,
          status: "ERROR",
          errorMessage: data.error?.message || `Failed to check container: ${res.statusText}`,
        };
      }

      const statusCode = data.status_code;
      if (statusCode === "FINISHED") {
        return { containerId, status: "READY", statusCode };
      } else if (statusCode === "IN_PROGRESS") {
        return { containerId, status: "IN_PROGRESS", statusCode };
      } else if (statusCode === "ERROR" || statusCode === "EXPIRED") {
        return { containerId, status: "ERROR", statusCode, errorMessage: `Container ended in status: ${statusCode}` };
      }

      return { containerId, status: "READY", statusCode };
    } catch (err: any) {
      return { containerId, status: "ERROR", errorMessage: err.message || "Network error polling Instagram container" };
    }
  }

  async finalizePublish(
    account: PlatformAccountCredentials,
    containerId: string,
    caption: string
  ): Promise<PublishFinalizeResult> {
    if (!account.accessToken || !account.accountId) {
      return { success: false, error: "Missing Instagram credentials" };
    }

    if (account.accessToken.startsWith("test_") || account.accessToken.startsWith("mock_")) {
      const publishedPostId = `ig_post_${crypto.randomUUID().slice(0, 14)}`;
      return {
        publishedPostId,
        publishedUrl: `https://instagram.com/p/${publishedPostId}`,
        success: true,
      };
    }

    try {
      const endpoint = `https://graph.facebook.com/v20.0/${account.accountId}/media_publish`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: account.accessToken,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        return {
          success: false,
          error: data.error?.message || `Instagram publication finalization failed: ${res.statusText}`,
        };
      }

      const publishedPostId = data.id;
      return {
        publishedPostId,
        publishedUrl: `https://instagram.com/p/${publishedPostId}`,
        success: true,
      };
    } catch (err: any) {
      return { success: false, error: err.message || "Network error finalizing Instagram post" };
    }
  }
}
