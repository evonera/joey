import { escapeXml, safeColor } from "./static-card-renderer";

export interface VideoReelRenderOptions {
  hookText: string;
  videoUrl?: string;
  posterUrl?: string;
  account?: {
    name: string;
    handle: string;
    avatarUrl?: string;
    isVerified?: boolean;
  };
  brandKit?: {
    primaryColor?: string;
    accentColor?: string;
    textColor?: string;
    watermark?: string;
    fontFamily?: string;
  };
  audioIndicator?: boolean;
  layout?: "minimal_hook" | "streamer_news" | "split_gaming";
  secondaryVideoUrl?: string; // e.g. parkour or subway surfers underneath
  width?: number;
  height?: number;
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + " " + word).trim().length <= maxCharsPerLine) {
      currentLine = (currentLine + " " + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [""];
}

/**
 * Renders an authentic 9:16 Vertical Video Meme Reel poster / SVG overlay.
 * Matches viral formats from TikTok, IG Reels, and X Video.
 */
export function renderVideoReelSvg(options: VideoReelRenderOptions): string {
  const {
    hookText,
    posterUrl,
    account,
    brandKit = {},
    audioIndicator = true,
    layout = account ? "streamer_news" : "minimal_hook",
  } = options;

  const width = options.width || 1080;
  const height = options.height || 1920;

  const primaryBg = safeColor(brandKit.primaryColor, "#000000");
  const accentColor = safeColor(brandKit.accentColor, "#ffe633");
  const textColor = safeColor(brandKit.textColor, "#ffffff");
  const watermark = brandKit.watermark || "@JoeyReels";
  const fontFamily = escapeXml(brandKit.fontFamily || "system-ui, -apple-system, sans-serif");

  // Center video frame dimensions (16:9 widescreen video centered in 9:16 frame)
  const videoWidth = width;
  const videoHeight = Math.round(width * (9 / 16)); // ~607px
  const videoY = Math.round((height - videoHeight) / 2);

  // Top Hook Area
  const hookLines = wrapText(hookText, 26).slice(0, 4);
  const hookLineHeight = 56;
  const hookFontSize = 46;

  let topHeaderSvg = "";

  if (layout === "streamer_news" && account) {
    const accName = escapeXml(account.name || "Streamer News");
    const accHandle = escapeXml(account.handle.startsWith("@") ? account.handle : `@${account.handle}`);
    const isVerified = account.isVerified ?? true;
    const avatarSize = 64;

    topHeaderSvg = `
      <!-- Streamer Account Header -->
      <g transform="translate(60, 180)">
        <defs>
          <clipPath id="accountAvatarClip">
            <circle cx="${avatarSize / 2}" cy="${avatarSize / 2}" r="${avatarSize / 2}" />
          </clipPath>
        </defs>
        <circle cx="${avatarSize / 2}" cy="${avatarSize / 2}" r="${avatarSize / 2 + 2}" fill="#333" stroke="${accentColor}" stroke-width="2" />
        ${
          account.avatarUrl
            ? `<image href="${escapeXml(account.avatarUrl)}" width="${avatarSize}" height="${avatarSize}" clip-path="url(#accountAvatarClip)" preserveAspectRatio="xMidYMid slice" />`
            : `<text x="${avatarSize / 2}" y="${avatarSize / 2 + 8}" text-anchor="middle" fill="#ffffff" font-family="${fontFamily}" font-size="24" font-weight="700">${accName.charAt(0)}</text>`
        }
        <text x="${avatarSize + 20}" y="28" fill="${textColor}" font-family="${fontFamily}" font-size="28" font-weight="800">${accName}</text>
        ${
          isVerified
            ? `<g transform="translate(${avatarSize + 24 + accName.length * 16}, 6)">
                <circle cx="12" cy="12" r="10" fill="#1d9bf0" />
                <path d="M7 12 L10 15 L17 8" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
              </g>`
            : ""
        }
        <text x="${avatarSize + 20}" y="56" fill="#a1a1aa" font-family="${fontFamily}" font-size="20" font-weight="500">${accHandle}</text>
      </g>
    `;
  }

  // Hook Text SVG (Centered above video)
  const hookStartY = layout === "streamer_news" ? 340 : videoY - (hookLines.length * hookLineHeight + 40);
  const hookTextSvg = `
    <!-- Top Hook Text -->
    <g transform="translate(${width / 2}, ${hookStartY})">
      ${hookLines
        .map(
          (line, i) =>
            `<text x="0" y="${i * hookLineHeight}" text-anchor="middle" fill="${textColor}" font-family="${fontFamily}" font-size="${hookFontSize}" font-weight="800" letter-spacing="-0.5">${escapeXml(line)}</text>`
        )
        .join("\n      ")}
    </g>
  `;

  // Video Frame / Poster
  const videoFrameSvg = `
    <!-- Video Player Container -->
    <g transform="translate(0, ${videoY})">
      <rect width="${videoWidth}" height="${videoHeight}" fill="#111111" />
      ${
        posterUrl
          ? `<image href="${escapeXml(posterUrl)}" width="${videoWidth}" height="${videoHeight}" preserveAspectRatio="xMidYMid slice" />`
          : `<rect width="${videoWidth}" height="${videoHeight}" fill="#18181b" />
             <text x="${width / 2}" y="${videoHeight / 2}" text-anchor="middle" fill="#71717a" font-family="${fontFamily}" font-size="24">Preview Video Placeholder</text>`
      }
      
      <!-- Video Play / Watermark Cue -->
      <g transform="translate(24, 24)">
        <rect width="110" height="36" rx="18" fill="#000000" fill-opacity="0.65" stroke="#ffffff" stroke-opacity="0.2" stroke-width="1" />
        <circle cx="18" cy="18" r="5" fill="#ef4444" />
        <text x="32" y="24" fill="#ffffff" font-family="${fontFamily}" font-size="14" font-weight="700" letter-spacing="1">VIDEO</text>
      </g>

      ${
        audioIndicator
          ? `<!-- Audio Mute/Unmute Pill -->
          <g transform="translate(${videoWidth - 140}, ${videoHeight - 56})">
            <rect width="116" height="38" rx="19" fill="#000000" fill-opacity="0.7" stroke="#ffffff" stroke-opacity="0.3" stroke-width="1" />
            <!-- Speaker Icon -->
            <path d="M16 23 L22 23 L28 29 L28 10 L22 16 L16 16 Z" fill="#ffffff" />
            <path d="M32 15 C34 17 34 22 32 24" stroke="#ffffff" stroke-width="2" stroke-linecap="round" fill="none" />
            <text x="40" y="24" fill="#ffffff" font-family="${fontFamily}" font-size="13" font-weight="600">AUDIO</text>
          </g>`
          : ""
      }
    </g>
  `;

  // Bottom Footer / Branding
  const footerSvg = `
    <!-- Bottom Footer -->
    <g transform="translate(${width / 2}, ${height - 120})">
      <text x="0" y="0" text-anchor="middle" fill="#71717a" font-family="${fontFamily}" font-size="22" font-weight="600" letter-spacing="1">${escapeXml(watermark)}</text>
      <text x="0" y="32" text-anchor="middle" fill="${accentColor}" font-family="${fontFamily}" font-size="16" font-weight="700" letter-spacing="2">SWIPE OR TAP FOR NEXT</text>
    </g>
  `;

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <!-- Solid Dark Frame -->
  <rect width="${width}" height="${height}" fill="${primaryBg}" />

  ${topHeaderSvg}
  ${hookTextSvg}
  ${videoFrameSvg}
  ${footerSvg}
</svg>`;
}
