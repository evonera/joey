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
    mediaType: string,
    caption?: string
  ): Promise<ContainerCreationResult> {
    if (!account.accessToken) {
      return { containerId: "", status: "ERROR", error: "Missing X account credentials or access token" };
    }

    if (account.accessToken.startsWith("test_") || account.accessToken.startsWith("mock_")) {
      const containerId = `mock_media_${crypto.randomUUID().slice(0, 12)}`;
      return { containerId, status: "READY" };
    }

    if (mediaUrls.length === 0) {
      return { containerId: "", status: "READY" };
    }

    try {
      // Ingest remote media URL and upload to Twitter v1.1 media upload API
      const mediaRes = await fetch(mediaUrls[0]);
      if (!mediaRes.ok) {
        return {
          containerId: "",
          status: "ERROR",
          error: `Failed to fetch media asset from URL: ${mediaRes.statusText}`,
        };
      }

      const mediaBuffer = await mediaRes.arrayBuffer();
      const base64Data = Buffer.from(mediaBuffer).toString("base64");

      const uploadRes = await fetch("https://upload.twitter.com/1.1/media/upload.json", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          media_data: base64Data,
        }).toString(),
      });

      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.media_id_string) {
        return {
          containerId: "",
          status: "ERROR",
          error: uploadData.errors?.[0]?.message || uploadData.error || "Failed to upload media to X",
        };
      }

      return {
        containerId: uploadData.media_id_string,
        status: "READY",
      };
    } catch (err: any) {
      return {
        containerId: "",
        status: "ERROR",
        error: err.message || "Failed to upload media to X",
      };
    }
  }

  async pollContainerStatus(
    account: PlatformAccountCredentials,
    containerId: string
  ): Promise<ContainerStatusResult> {
    if (!account.accessToken) {
      return { containerId, status: "ERROR", errorMessage: "Missing access token" };
    }

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
    if (!account.accessToken) {
      return { success: false, error: "Missing X (Twitter) credentials" };
    }

    if (account.accessToken.startsWith("test_") || account.accessToken.startsWith("mock_")) {
      const publishedPostId = `x_tweet_${crypto.randomUUID().slice(0, 14)}`;
      return {
        publishedPostId,
        publishedUrl: `https://x.com/user/status/${publishedPostId}`,
        success: true,
      };
    }

    try {
      const tweetPayload: Record<string, any> = { text: caption };
      if (containerId && !containerId.startsWith("mock_")) {
        tweetPayload.media = { media_ids: [containerId] };
      }

      const res = await fetch("https://api.twitter.com/2/tweets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(tweetPayload),
      });

      const data = await res.json();
      if (!res.ok || data.errors) {
        const errorDetail = data.errors ? data.errors.map((e: any) => e.message).join(", ") : res.statusText;
        return {
          success: false,
          error: `Twitter API v2 error: ${errorDetail}`,
        };
      }

      const publishedPostId = data.data?.id;
      return {
        publishedPostId,
        publishedUrl: `https://x.com/user/status/${publishedPostId}`,
        success: true,
      };
    } catch (err: any) {
      return { success: false, error: err.message || "Network error publishing to X" };
    }
  }
}
