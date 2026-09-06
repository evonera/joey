export interface TweetAuthor {
  name: string;
  handle: string;
  avatarUrl?: string;
  isVerified?: boolean;
}

export interface TweetCardRenderOptions {
  author: TweetAuthor;
  content: string;
  mediaUrls?: string[];
  mediaLayout?: "single" | "2-column" | "4-grid" | "none";
  createdAt?: string;
  quotedTweet?: {
    author: TweetAuthor;
    content: string;
    mediaUrl?: string;
  };
  aspectRatio?: "1:1" | "4:5" | "16:9";
  width?: number;
  height?: number;
  brandKit?: {
    primaryColor?: string;
    textColor?: string;
    accentColor?: string;
    watermark?: string;
  };
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeColor(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  return /^(?:#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%+-]+\)|[a-z]{3,20})$/i.test(trimmed)
    ? trimmed
    : fallback;
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

const VERIFIED_BADGE_SVG = `
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 12L11 14L15 10M12 3L14.5 5.5L18 5L18.5 8.5L21 11L19.5 14L20.5 17.5L17 18.5L15.5 21.5L12 20.5L8.5 21.5L7 18.5L3.5 17.5L4.5 14L3 11L5.5 8.5L6 5L9.5 5.5L12 3Z" fill="#1d9bf0" stroke="#1d9bf0" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M9 12L11 14L15 10" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

/**
 * Renders an authentic Twitter / X post card as an SVG.
 * Supports single image, 2-column side-by-side, 4-grid collage, and stacked quote tweet / reply.
 */
export function renderTweetCardSvg(options: TweetCardRenderOptions): string {
  const {
    author,
    content,
    mediaUrls = [],
    mediaLayout = mediaUrls.length >= 4 ? "4-grid" : mediaUrls.length === 2 ? "2-column" : mediaUrls.length === 1 ? "single" : "none",
    createdAt = "Today",
    quotedTweet,
    aspectRatio = "4:5",
    brandKit = {},
  } = options;

  const width = options.width || 1080;
  const height = options.height || (aspectRatio === "4:5" ? 1350 : aspectRatio === "16:9" ? 607 : 1080);

  const primaryBg = safeColor(brandKit.primaryColor, "#000000");
  const textColor = safeColor(brandKit.textColor, "#ffffff");
  const secondaryTextColor = "#71767b";
  const borderColor = "#2f3336";

  const paddingX = 64;
  const paddingY = 64;
  const cardWidth = width - paddingX * 2;

  let currentY = paddingY;

  // Header: Avatar, Name, Handle, Verified Badge, X Logo
  const avatarSize = 56;
  const authorName = escapeXml(author.name || "User");
  const authorHandle = escapeXml(author.handle.startsWith("@") ? author.handle : `@${author.handle}`);
  const isVerified = author.isVerified ?? true;

  // Header SVG chunk
  const headerSvg = `
    <!-- Author Header -->
    <g transform="translate(${paddingX}, ${currentY})">
      <defs>
        <clipPath id="authorAvatarClip">
          <circle cx="${avatarSize / 2}" cy="${avatarSize / 2}" r="${avatarSize / 2}" />
        </clipPath>
      </defs>
      <circle cx="${avatarSize / 2}" cy="${avatarSize / 2}" r="${avatarSize / 2}" fill="#333639" />
      ${
        author.avatarUrl
          ? `<image href="${escapeXml(author.avatarUrl)}" width="${avatarSize}" height="${avatarSize}" clip-path="url(#authorAvatarClip)" preserveAspectRatio="xMidYMid slice" />`
          : `<text x="${avatarSize / 2}" y="${avatarSize / 2 + 7}" text-anchor="middle" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="700">${escapeXml(authorName.charAt(0))}</text>`
      }
      <!-- Author Names -->
      <text x="${avatarSize + 18}" y="24" fill="${textColor}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="700">${authorName}</text>
      ${
        isVerified
          ? `<g transform="translate(${avatarSize + 22 + authorName.length * 13}, 6)">
              <circle cx="10" cy="10" r="9" fill="#1d9bf0" />
              <path d="M6 10.5 L9 13.5 L14 7.5" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
            </g>`
          : ""
      }
      <text x="${avatarSize + 18}" y="48" fill="${secondaryTextColor}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="400">${authorHandle} · ${escapeXml(createdAt)}</text>
      <!-- X Logo -->
      <g transform="translate(${cardWidth - 28}, 8)">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" fill="${secondaryTextColor}" transform="scale(0.85)"/>
      </g>
    </g>
  `;

  currentY += avatarSize + 28;

  // Main Tweet Content
  const contentLines = wrapText(content, 42).slice(0, 5);
  const contentLineHeight = 36;
  const contentSvg = `
    <!-- Main Tweet Text -->
    <g transform="translate(${paddingX}, ${currentY})">
      ${contentLines
        .map(
          (line, i) =>
            `<text x="0" y="${i * contentLineHeight}" fill="${textColor}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="24" font-weight="400" letter-spacing="-0.2">${escapeXml(line)}</text>`
        )
        .join("\n      ")}
    </g>
  `;

  currentY += contentLines.length * contentLineHeight + 20;

  // Media Container (Single, 2-column, or 4-grid)
  let mediaSvg = "";
  const mediaContainerWidth = cardWidth;
  const maxMediaHeight = quotedTweet ? 440 : (aspectRatio === "4:5" ? 640 : 480);

  if (mediaLayout === "4-grid" && mediaUrls.length >= 4) {
    const halfWidth = (mediaContainerWidth - 8) / 2;
    const halfHeight = (maxMediaHeight - 8) / 2;
    mediaSvg = `
      <!-- 4-Grid Media Collage -->
      <g transform="translate(${paddingX}, ${currentY})">
        <defs>
          <clipPath id="grid4_top_left"><rect x="0" y="0" width="${halfWidth}" height="${halfHeight}" rx="14" /></clipPath>
          <clipPath id="grid4_top_right"><rect x="${halfWidth + 8}" y="0" width="${halfWidth}" height="${halfHeight}" rx="14" /></clipPath>
          <clipPath id="grid4_bottom_left"><rect x="0" y="${halfHeight + 8}" width="${halfWidth}" height="${halfHeight}" rx="14" /></clipPath>
          <clipPath id="grid4_bottom_right"><rect x="${halfWidth + 8}" y="${halfHeight + 8}" width="${halfWidth}" height="${halfHeight}" rx="14" /></clipPath>
        </defs>
        <image href="${escapeXml(mediaUrls[0])}" x="0" y="0" width="${halfWidth}" height="${halfHeight}" clip-path="url(#grid4_top_left)" preserveAspectRatio="xMidYMid slice" />
        <image href="${escapeXml(mediaUrls[1])}" x="${halfWidth + 8}" y="0" width="${halfWidth}" height="${halfHeight}" clip-path="url(#grid4_top_right)" preserveAspectRatio="xMidYMid slice" />
        <image href="${escapeXml(mediaUrls[2])}" x="0" y="${halfHeight + 8}" width="${halfWidth}" height="${halfHeight}" clip-path="url(#grid4_bottom_left)" preserveAspectRatio="xMidYMid slice" />
        <image href="${escapeXml(mediaUrls[3])}" x="${halfWidth + 8}" y="${halfHeight + 8}" width="${halfWidth}" height="${halfHeight}" clip-path="url(#grid4_bottom_right)" preserveAspectRatio="xMidYMid slice" />
      </g>
    `;
    currentY += maxMediaHeight + 28;
  } else if (mediaLayout === "2-column" && mediaUrls.length >= 2) {
    const halfWidth = (mediaContainerWidth - 8) / 2;
    mediaSvg = `
      <!-- 2-Column Comparison -->
      <g transform="translate(${paddingX}, ${currentY})">
        <defs>
          <clipPath id="grid2_left"><rect x="0" y="0" width="${halfWidth}" height="${maxMediaHeight}" rx="14" /></clipPath>
          <clipPath id="grid2_right"><rect x="${halfWidth + 8}" y="0" width="${halfWidth}" height="${maxMediaHeight}" rx="14" /></clipPath>
        </defs>
        <image href="${escapeXml(mediaUrls[0])}" x="0" y="0" width="${halfWidth}" height="${maxMediaHeight}" clip-path="url(#grid2_left)" preserveAspectRatio="xMidYMid slice" />
        <image href="${escapeXml(mediaUrls[1])}" x="${halfWidth + 8}" y="0" width="${halfWidth}" height="${maxMediaHeight}" clip-path="url(#grid2_right)" preserveAspectRatio="xMidYMid slice" />
      </g>
    `;
    currentY += maxMediaHeight + 28;
  } else if (mediaLayout === "single" && mediaUrls.length >= 1) {
    mediaSvg = `
      <!-- Single Media Container -->
      <g transform="translate(${paddingX}, ${currentY})">
        <defs>
          <clipPath id="singleMediaClip"><rect x="0" y="0" width="${mediaContainerWidth}" height="${maxMediaHeight}" rx="16" /></clipPath>
        </defs>
        <image href="${escapeXml(mediaUrls[0])}" x="0" y="0" width="${mediaContainerWidth}" height="${maxMediaHeight}" clip-path="url(#singleMediaClip)" preserveAspectRatio="xMidYMid slice" />
        <rect x="0" y="0" width="${mediaContainerWidth}" height="${maxMediaHeight}" rx="16" fill="none" stroke="${borderColor}" stroke-width="1.5" />
      </g>
    `;
    currentY += maxMediaHeight + 28;
  }

  // Quoted Tweet Box (Stacked Reply)
  let quoteSvg = "";
  if (quotedTweet) {
    const quoteAuthorName = escapeXml(quotedTweet.author.name);
    const quoteAuthorHandle = escapeXml(quotedTweet.author.handle.startsWith("@") ? quotedTweet.author.handle : `@${quotedTweet.author.handle}`);
    const quoteContentLines = wrapText(quotedTweet.content, 44).slice(0, 4);
    const quoteBoxHeight = 80 + quoteContentLines.length * 30 + (quotedTweet.mediaUrl ? 180 : 0);

    quoteSvg = `
      <!-- Quoted Tweet Box -->
      <g transform="translate(${paddingX}, ${currentY})">
        <rect x="0" y="0" width="${cardWidth}" height="${quoteBoxHeight}" rx="16" fill="#16181c" stroke="${borderColor}" stroke-width="1.5" />
        <!-- Quoted Author -->
        <g transform="translate(18, 18)">
          <circle cx="16" cy="16" r="16" fill="#333639" />
          ${
            quotedTweet.author.avatarUrl
              ? `<image href="${escapeXml(quotedTweet.author.avatarUrl)}" width="32" height="32" clip-path="url(#quoteAvatarClip)" preserveAspectRatio="xMidYMid slice" />`
              : `<text x="16" y="21" text-anchor="middle" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="700">${escapeXml(quoteAuthorName.charAt(0))}</text>`
          }
          <text x="42" y="16" fill="${textColor}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="700">${quoteAuthorName}</text>
          <text x="${48 + quoteAuthorName.length * 10}" y="16" fill="${secondaryTextColor}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16">${quoteAuthorHandle}</text>
        </g>
        <!-- Quoted Content -->
        <g transform="translate(18, 64)">
          ${quoteContentLines
            .map(
              (line, i) =>
                `<text x="0" y="${i * 28}" fill="${textColor}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="400">${escapeXml(line)}</text>`
            )
            .join("\n          ")}
        </g>
        ${
          quotedTweet.mediaUrl
            ? `<g transform="translate(18, ${64 + quoteContentLines.length * 28 + 12})">
                <rect x="0" y="0" width="${cardWidth - 36}" height="140" rx="10" fill="#222" />
                <image href="${escapeXml(quotedTweet.mediaUrl)}" width="${cardWidth - 36}" height="140" preserveAspectRatio="xMidYMid slice" />
              </g>`
            : ""
        }
      </g>
    `;
    currentY += quoteBoxHeight + 24;
  }

  // Footer: Watermark / Metrics pill
  const watermark = brandKit.watermark || "@JoeyThemeStudio";
  const footerSvg = `
    <!-- Tweet Footer -->
    <g transform="translate(${paddingX}, ${height - 48})">
      <line x1="0" y1="-16" x2="${cardWidth}" y2="-16" stroke="${borderColor}" stroke-width="1" />
      <text x="0" y="12" fill="${secondaryTextColor}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="500">${escapeXml(watermark)}</text>
      <text x="${cardWidth}" y="12" text-anchor="end" fill="#1d9bf0" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="600">Post via Joey</text>
    </g>
  `;

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="quoteAvatarClip">
      <circle cx="16" cy="16" r="16" />
    </clipPath>
  </defs>
  <!-- Background Canvas -->
  <rect width="${width}" height="${height}" fill="${primaryBg}" />

  ${headerSvg}
  ${contentSvg}
  ${mediaSvg}
  ${quoteSvg}
  ${footerSvg}
</svg>`;
}
