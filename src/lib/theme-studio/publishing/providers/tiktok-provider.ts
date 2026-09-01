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
    if (!account.accessToken) {
      return { containerId: "", status: "ERROR", error: "Missing TikTok account credentials or access token" };
    }

    if (account.accessToken.startsWith("test_") || account.accessToken.startsWith("mock_")) {
      const containerId = `tt_cnt_${crypto.randomUUID().slice(0, 12)}`;
      return { containerId, status: "READY" };
    }

    try {
      const res = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          post_info: {
            title: "Theme Studio Video",
            privacy_level: "PUBLIC_TO_EVERYONE",
            disable_duet: false,
            disable_stitch: false,
            disable_comment: false,
          },
          source_info: {
            source: "PULL_FROM_URL",
            video_url: mediaUrls[0],
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error?.code !== "ok") {
        return {
          containerId: "",
          status: "ERROR",
          error: data.error?.message || `TikTok API error: ${res.statusText}`,
        };
      }

      const publishId = data.data?.publish_id;
      return {
        containerId: publishId,
        status: "IN_PROGRESS",
      };
    } catch (err: any) {
      return { containerId: "", status: "ERROR", error: err.message || "Network error connecting to TikTok" };
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
      return { containerId, status: "READY", statusCode: "SUCCESS" };
    }

    try {
      const res = await fetch("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ publish_id: containerId }),
      });

      const data = await res.json();
      if (!res.ok || data.error?.code !== "ok") {
        return {
          containerId,
          status: "ERROR",
          errorMessage: data.error?.message || `Failed to fetch TikTok status: ${res.statusText}`,
        };
      }

      const status = data.data?.status;
      if (status === "PUBLISH_COMPLETE") {
        return { containerId, status: "READY", statusCode: status };
      } else if (status === "FAILED") {
        return { containerId, status: "ERROR", statusCode: status, errorMessage: data.data?.fail_reason || "TikTok publishing failed" };
      }

      return { containerId, status: "IN_PROGRESS", statusCode: status };
    } catch (err: any) {
      return { containerId, status: "ERROR", errorMessage: err.message || "Network error checking TikTok container" };
    }
  }

  async finalizePublish(
    account: PlatformAccountCredentials,
    containerId: string,
    caption: string
  ): Promise<PublishFinalizeResult> {
    if (!account.accessToken) {
      return { success: false, error: "Missing TikTok credentials" };
    }

    const publishedPostId = containerId.startsWith("tt_cnt_") || account.accessToken.startsWith("test_")
      ? `tt_video_${containerId}`
      : containerId;

    return {
      publishedPostId,
      publishedUrl: `https://www.tiktok.com/@user/video/${publishedPostId}`,
      success: true,
    };
  }
}
