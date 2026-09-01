export interface PlatformAccountCredentials {
  accountId: string;
  platform: string;
  accessToken: string;
  refreshToken?: string;
  platformUserId?: string;
}

export interface ContainerCreationResult {
  containerId: string;
  status: "IN_PROGRESS" | "READY" | "ERROR";
  error?: string;
}

export interface ContainerStatusResult {
  containerId: string;
  status: "IN_PROGRESS" | "READY" | "ERROR";
  statusCode?: string;
  errorMessage?: string;
}

export interface PublishFinalizeResult {
  publishedPostId: string;
  publishedUrl?: string;
  success: boolean;
  error?: string;
}

export interface ContentLimits {
  maxCaptionLength: number;
  maxHashtags: number;
  allowedAspectRatios: string[];
  maxCarouselSlides: number;
  supportsVideo: boolean;
}

export interface IPlatformProvider {
  readonly platform: string;
  getLimits(): ContentLimits;
  validateContent(caption: string, mediaUrls: string[], mediaType: string): { valid: boolean; errors: string[] };
  createMediaContainer(account: PlatformAccountCredentials, mediaUrls: string[], mediaType: string): Promise<ContainerCreationResult>;
  pollContainerStatus(account: PlatformAccountCredentials, containerId: string): Promise<ContainerStatusResult>;
  finalizePublish(account: PlatformAccountCredentials, containerId: string, caption: string): Promise<PublishFinalizeResult>;
}
