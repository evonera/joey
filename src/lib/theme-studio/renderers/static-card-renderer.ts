export interface CardRenderOptions {
  title: string;
  body?: string;
  tag?: string;
  sourceName?: string;
  brandKit?: {
    primaryColor?: string;
    accentColor?: string;
    textColor?: string;
    watermark?: string;
    fontFamily?: string;
  };
  aspectRatio?: "1:1" | "4:5" | "16:9" | "9:16";
  width?: number;
  height?: number;
  slideNumber?: number;
  totalSlides?: number;
}

/**
 * Escapes XML special characters for SVG text safety.
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function splitGraphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && typeof (Intl as any).Segmenter === "function") {
    const segmenter = new (Intl as any).Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), (s: any) => s.segment);
  }
  return Array.from(text);
}

/**
 * Wraps text into lines with a maximum character count, splitting long unbroken tokens to prevent canvas overflow.
 */
function wrapText(text: string, maxCharsPerLine: number = 28): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const rawWord of words) {
    if (!rawWord) continue;
    let graphemes = splitGraphemes(rawWord);

    while (graphemes.length > maxCharsPerLine) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }
      lines.push(graphemes.slice(0, maxCharsPerLine).join(""));
      graphemes = graphemes.slice(maxCharsPerLine);
    }

    const remainingWord = graphemes.join("");
    if (!remainingWord) continue;

    const currentGraphemesCount = splitGraphemes(currentLine ? currentLine + " " + remainingWord : remainingWord).length;
    if (currentGraphemesCount <= maxCharsPerLine) {
      currentLine = currentLine ? currentLine + " " + remainingWord : remainingWord;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = remainingWord;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Deterministically renders an SVG card representing the branded visual layout.
 */
export function renderCardSvg(options: CardRenderOptions): string {
  const {
    title,
    body = "",
    tag = "UPDATES",
    sourceName,
    brandKit = {},
    aspectRatio = "1:1",
    slideNumber,
    totalSlides,
  } = options;

  let width = options.width || 1080;
  let height = options.height || (aspectRatio === "4:5" ? 1350 : aspectRatio === "16:9" ? 607 : aspectRatio === "9:16" ? 1920 : 1080);

  const primaryColor = brandKit.primaryColor || "#0f172a";
  const accentColor = brandKit.accentColor || "#38bdf8";
  const textColor = brandKit.textColor || "#f8fafc";
  const watermark = brandKit.watermark || "@ThemePage";
  const fontFamily = brandKit.fontFamily || "system-ui, -apple-system, sans-serif";

  const rawTitleLines = wrapText(title, 24);
  const titleLines = rawTitleLines.slice(0, 3);
  if (rawTitleLines.length > 3 && titleLines[2]) {
    titleLines[2] = titleLines[2].replace(/\.{3}$/, "") + "...";
  }

  const titleStartY = height * 0.32;
  const bodyStartY = titleStartY + titleLines.length * 60 + 24;

  const availableBodyHeight = (height - 140) - bodyStartY;
  const maxBodyLines = Math.max(1, Math.min(4, Math.floor(availableBodyHeight / 42)));
  const bodyLines = wrapText(body, 36).slice(0, maxBodyLines);

  const isCarousel = slideNumber !== undefined && totalSlides !== undefined;
  const clampedTag = tag.length > 20 ? `${tag.slice(0, 17)}...` : tag;
  const tagBadgeWidth = Math.min(clampedTag.length * 13 + 32, 280);

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${escapeXml(primaryColor)}" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>
    <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#000000" flood-opacity="0.5"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bgGrad)" />

  <!-- Accent Top Glow Bar -->
  <rect x="0" y="0" width="${width}" height="12" fill="${escapeXml(accentColor)}" />

  <!-- Top Header Tag -->
  <g transform="translate(80, 80)">
    <rect x="0" y="0" width="${tagBadgeWidth}" height="42" rx="21" fill="${escapeXml(accentColor)}" fill-opacity="0.18" stroke="${escapeXml(accentColor)}" stroke-opacity="0.4" stroke-width="2" />
    <text x="16" y="27" fill="${escapeXml(accentColor)}" font-family="${escapeXml(fontFamily)}" font-size="16" font-weight="800" letter-spacing="1.5">${escapeXml(clampedTag.toUpperCase())}</text>
  </g>

  ${
    sourceName
      ? `<text x="${width - 80}" y="108" text-anchor="end" fill="${escapeXml(textColor)}" fill-opacity="0.65" font-family="${escapeXml(fontFamily)}" font-size="20" font-weight="600">${escapeXml(sourceName)}</text>`
      : ""
  }

  ${
    isCarousel
      ? `<!-- Slide Indicator -->
  <g transform="translate(${width - 160}, 80)">
    <rect x="0" y="0" width="80" height="42" rx="21" fill="#ffffff" fill-opacity="0.12" />
    <text x="40" y="27" text-anchor="middle" fill="${escapeXml(textColor)}" font-family="${escapeXml(fontFamily)}" font-size="18" font-weight="700">${slideNumber}/${totalSlides}</text>
  </g>`
      : ""
  }

  <!-- Title Heading -->
  <g transform="translate(80, ${titleStartY})">
    ${titleLines
      .map(
        (line, idx) =>
          `<text x="0" y="${idx * 60}" fill="${escapeXml(textColor)}" font-family="${escapeXml(fontFamily)}" font-size="48" font-weight="900" letter-spacing="-0.5">${escapeXml(line)}</text>`
      )
      .join("\n    ")}
  </g>

  <!-- Body Content -->
  ${
    bodyLines.length > 0
      ? `<g transform="translate(80, ${bodyStartY})">
    ${bodyLines
      .map(
        (line, idx) =>
          `<text x="0" y="${idx * 40}" fill="${escapeXml(textColor)}" fill-opacity="0.85" font-family="${escapeXml(fontFamily)}" font-size="26" font-weight="400" line-height="1.5">${escapeXml(line)}</text>`
      )
      .join("\n    ")}
  </g>`
      : ""
  }

  <!-- Footer Watermark -->
  <g transform="translate(80, ${height - 90})">
    <line x1="0" y1="0" x2="${width - 160}" y2="0" stroke="#ffffff" stroke-opacity="0.15" stroke-width="1.5" />
    <text x="0" y="45" fill="${escapeXml(textColor)}" fill-opacity="0.75" font-family="${escapeXml(fontFamily)}" font-size="22" font-weight="700">${escapeXml(watermark)}</text>
    <text x="${width - 160}" y="45" text-anchor="end" fill="${escapeXml(accentColor)}" font-family="${escapeXml(fontFamily)}" font-size="18" font-weight="600">Joey.ai Theme Studio</text>
  </g>
</svg>`;
}

/**
 * Renders an array of SVGs for a multi-slide carousel package.
 */
export function renderCarouselSlideSvgs(
  slides: Array<{ title: string; body: string; tag?: string }>,
  brandKit?: CardRenderOptions["brandKit"],
  aspectRatio: "1:1" | "4:5" = "1:1"
): string[] {
  return slides.map((slide, index) =>
    renderCardSvg({
      title: slide.title,
      body: slide.body,
      tag: slide.tag || (index === 0 ? "COVER" : index === slides.length - 1 ? "TAKEAWAY" : `POINT #${index}`),
      brandKit,
      aspectRatio,
      slideNumber: index + 1,
      totalSlides: slides.length,
    })
  );
}
