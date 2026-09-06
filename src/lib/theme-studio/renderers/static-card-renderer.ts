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
    titleSize?: number;
    bodySize?: number;
    showWatermark?: boolean;
    logoMonogram?: string;
    scrimIntensity?: number;
    templatePreset?: string;
  };
  aspectRatio?: "1:1" | "4:5" | "16:9" | "9:16";
  width?: number;
  height?: number;
  slideNumber?: number;
  totalSlides?: number;
  imageUrl?: string;
  topBadge?: "yellow_logo" | "swipe_pill" | "tag_pill" | "none";
  showDividerMark?: boolean;
  pipInsetUrl?: string;
  highlightWords?: string[];
  isOutroSlide?: boolean;
  outroWatermarkText?: string;
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

function safeColor(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  return /^(?:#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%+-]+\)|[a-z]{3,20})$/i.test(trimmed)
    ? trimmed
    : fallback;
}

function splitGraphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), ({ segment }) => segment);
  }
  return Array.from(text);
}

function graphemeWidth(grapheme: string): number {
  const code = grapheme.codePointAt(0) || 0;
  return (
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xffe6) ||
    (code >= 0x1f000 && code <= 0x1ffff) ||
    (code >= 0x2600 && code <= 0x27ff)
  ) ? 2 : 1;
}

function visualWidth(text: string): number {
  return splitGraphemes(text).reduce((width, grapheme) => width + graphemeWidth(grapheme), 0);
}

function takeVisualWidth(graphemes: string[], maxWidth: number): { head: string[]; tail: string[] } {
  let width = 0;
  let index = 0;
  while (index < graphemes.length) {
    const nextWidth = graphemeWidth(graphemes[index]);
    if (index > 0 && width + nextWidth > maxWidth) break;
    width += nextWidth;
    index++;
  }
  return { head: graphemes.slice(0, index), tail: graphemes.slice(index) };
}

function clampVisualWidth(text: string, maxWidth: number): string {
  if (visualWidth(text) <= maxWidth) return text;
  const ellipsis = "...";
  const { head } = takeVisualWidth(splitGraphemes(text), Math.max(1, maxWidth - visualWidth(ellipsis)));
  return `${head.join("")}${ellipsis}`;
}

/**
 * Wraps text by approximate visual width without splitting grapheme clusters.
 */
function wrapText(text: string, maxCharsPerLine: number = 28): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const rawWord of words) {
    if (!rawWord) continue;
    let graphemes = splitGraphemes(rawWord);
    while (visualWidth(graphemes.join("")) > maxCharsPerLine) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }
      const { head, tail } = takeVisualWidth(graphemes, maxCharsPerLine);
      lines.push(head.join(""));
      graphemes = tail;
    }
    const word = graphemes.join("");
    if (!word) continue;
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (visualWidth(candidate) <= maxCharsPerLine) {
      currentLine = candidate;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function boundedLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const lines = wrapText(text, maxCharsPerLine);
  if (lines.length <= maxLines) return lines;
  const bounded = lines.slice(0, maxLines);
  bounded[maxLines - 1] = clampVisualWidth(bounded[maxLines - 1].replace(/[.…]+$/, ""), maxCharsPerLine - 3) + "...";
  return bounded;
}

/**
 * Renders text with highlighted keywords wrapped in <tspan fill="..." font-weight="bold">
 */
function formatLineWithHighlights(
  rawLine: string,
  highlightWords: string[] = [],
  highlightColor: string
): string {
  const parts: Array<{ text: string; isHighlight: boolean }> = [];
  const regex = /\*([^*]+)\*/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(rawLine)) !== null) {
    if (match.index > lastIdx) {
      parts.push({ text: rawLine.slice(lastIdx, match.index), isHighlight: false });
    }
    parts.push({ text: match[1], isHighlight: true });
    lastIdx = regex.lastIndex;
  }
  if (lastIdx < rawLine.length) {
    parts.push({ text: rawLine.slice(lastIdx), isHighlight: false });
  }

  const refinedParts: Array<{ text: string; isHighlight: boolean }> = [];
  for (const part of parts) {
    if (part.isHighlight || !highlightWords.length) {
      refinedParts.push(part);
      continue;
    }
    let subText = part.text;
    let found = false;
    for (const hw of highlightWords) {
      if (!hw.trim()) continue;
      const pos = subText.toLowerCase().indexOf(hw.toLowerCase());
      if (pos !== -1) {
        if (pos > 0) refinedParts.push({ text: subText.slice(0, pos), isHighlight: false });
        refinedParts.push({ text: subText.slice(pos, pos + hw.length), isHighlight: true });
        subText = subText.slice(pos + hw.length);
        found = true;
        break;
      }
    }
    if (!found) refinedParts.push({ text: subText, isHighlight: false });
  }

  return refinedParts
    .map((p) => {
      const escaped = escapeXml(p.text);
      return p.isHighlight
        ? `<tspan fill="${escapeXml(highlightColor)}" font-weight="bold">${escaped}</tspan>`
        : escaped;
    })
    .join("");
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
    imageUrl,
    pipInsetUrl,
    highlightWords = [],
    isOutroSlide = false,
    outroWatermarkText,
  } = options;

  const width = options.width || 1080;
  const height =
    options.height ||
    (aspectRatio === "4:5"
      ? 1350
      : aspectRatio === "16:9"
      ? 607
      : aspectRatio === "9:16"
      ? 1920
      : 1080);

  const primaryColor = safeColor(brandKit.primaryColor, "#0a0908");
  const accentColor = safeColor(brandKit.accentColor, "#ffe633");
  const textColor = safeColor(brandKit.textColor, "#ffffff");
  const watermark = brandKit.watermark || "@ThemePage";
  const logoMonogram = (
    brandKit.logoMonogram ||
    watermark.replace(/^@/, "").charAt(0) ||
    "P"
  ).toUpperCase();
  const fontFamily = brandKit.fontFamily || "system-ui, -apple-system, sans-serif";
  const displayFont = "'Impact', 'Anton', 'Bebas Neue', " + fontFamily;

  const titleFontSize = Math.min(84, Math.max(32, brandKit.titleSize ? brandKit.titleSize * 1.6 : 56));
  const bodyFontSize = Math.min(44, Math.max(20, brandKit.bodySize ? brandKit.bodySize * 1.4 : 26));

  const hasImage = Boolean(imageUrl && imageUrl.trim().length > 0);
  const isCarousel = slideNumber !== undefined && totalSlides !== undefined;

  // Resolve top badge style
  const topBadge =
    options.topBadge ||
    (hasImage
      ? isCarousel && slideNumber === 1
        ? "swipe_pill"
        : "yellow_logo"
      : "tag_pill");

  const showDivider = options.showDividerMark ?? (hasImage && !isOutroSlide);

  const titleLines = boundedLines(title, hasImage ? 22 : 24, aspectRatio === "16:9" ? 3 : 5);
  const bodyLines = wrapText(body, 38).slice(0, 4);

  const clampedTag = clampVisualWidth(tag.toUpperCase(), 20);
  const tagBadgeWidth = Math.min(visualWidth(clampedTag) * 14 + 32, 320);
  const clampedSourceName = sourceName ? clampVisualWidth(sourceName, 30) : undefined;
  const clampedWatermark = clampVisualWidth(watermark, 32);

  const titleLineHeight = titleFontSize * 1.18;
  const bodyLineHeight = bodyFontSize * 1.45;

  // Vertical layout calculations
  let titleStartY = height * 0.44;
  if (isOutroSlide) {
    titleStartY = height * 0.40;
  } else if (!body) {
    titleStartY = height * 0.52;
  } else if (hasImage) {
    titleStartY = height * 0.56;
  }
  const bodyStartY = titleStartY + titleLines.length * titleLineHeight + 24;
  const dividerY = titleStartY - 36;

  const scrimOpacity = brandKit.scrimIntensity ?? 0.88;

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${escapeXml(primaryColor)}" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>
    <linearGradient id="bottomScrim" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0" />
      <stop offset="35%" stop-color="#000000" stop-opacity="0.25" />
      <stop offset="65%" stop-color="#000000" stop-opacity="0.85" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0.98" />
    </linearGradient>
    <clipPath id="pipCircle">
      <circle cx="85" cy="85" r="85" />
    </clipPath>
    <filter id="textGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#000000" flood-opacity="0.8"/>
    </filter>
  </defs>

  <!-- Base Solid/Gradient Layer -->
  <rect width="${width}" height="${height}" fill="url(#bgGrad)" />

  ${
    hasImage
      ? `<!-- Hero Photo -->
  <image href="${escapeXml(imageUrl || "")}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" />
  <!-- Contrast Scrim -->
  <rect width="${width}" height="${height}" fill="url(#bottomScrim)" opacity="${scrimOpacity}" />`
      : ""
  }

  ${
    !hasImage
      ? `<!-- Accent Top Glow Bar -->
  <rect x="0" y="0" width="${width}" height="12" fill="${escapeXml(accentColor)}" />`
      : ""
  }

  <!-- Top Inset / Header Area -->
  ${
    pipInsetUrl
      ? `<!-- Picture-In-Picture Inset -->
  <g transform="translate(60, 60)">
    <circle cx="85" cy="85" r="89" fill="#ffffff" />
    <image href="${escapeXml(pipInsetUrl)}" x="0" y="0" width="170" height="170" clip-path="url(#pipCircle)" preserveAspectRatio="xMidYMid slice" />
    <circle cx="85" cy="85" r="85" fill="none" stroke="#ffffff" stroke-width="5" />
  </g>`
      : ""
  }

  ${
    topBadge === "yellow_logo"
      ? `<!-- Brand Monogram Shield -->
  <g transform="translate(${width - (isCarousel ? 230 : 145)}, 65)">
    <rect width="76" height="76" rx="18" fill="${escapeXml(accentColor)}" />
    <text x="38" y="53" text-anchor="middle" fill="#0a0908" font-family="${escapeXml(displayFont)}" font-size="48" font-weight="900">${escapeXml(logoMonogram)}</text>
  </g>`
      : topBadge === "swipe_pill"
      ? `<!-- Swipe Pill Cue -->
  <g transform="translate(${width - (isCarousel ? 360 : 250)}, 65)">
    <rect width="180" height="54" rx="27" fill="#000000" fill-opacity="0.5" stroke="#ffffff" stroke-opacity="0.8" stroke-width="2.5" />
    <text x="76" y="34" text-anchor="middle" fill="#ffffff" font-family="${escapeXml(fontFamily)}" font-size="18" font-weight="800" letter-spacing="2">SWIPE</text>
    <path d="M126 27 L140 27 M134 21 L141 27 L134 33" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
  </g>`
      : topBadge === "tag_pill"
      ? `<!-- Top Header Tag -->
  <g transform="translate(80, 80)">
    <rect x="0" y="0" width="${tagBadgeWidth}" height="42" rx="21" fill="${escapeXml(accentColor)}" fill-opacity="0.18" stroke="${escapeXml(accentColor)}" stroke-opacity="0.4" stroke-width="2" />
    <text x="16" y="27" fill="${escapeXml(accentColor)}" font-family="${escapeXml(fontFamily)}" font-size="16" font-weight="800" letter-spacing="1.5">${escapeXml(clampedTag)}</text>
  </g>`
      : ""
  }

  ${
    clampedSourceName
      ? `<text x="${width - 80}" y="108" text-anchor="end" fill="${escapeXml(textColor)}" fill-opacity="0.65" font-family="${escapeXml(fontFamily)}" font-size="20" font-weight="600">${escapeXml(clampedSourceName)}</text>`
      : ""
  }

  ${
    isCarousel
      ? `<!-- Slide Indicator -->
  <g transform="translate(${width - 160}, 72)">
    <rect x="0" y="0" width="80" height="42" rx="21" fill="#ffffff" fill-opacity="0.12" />
    <text x="40" y="27" text-anchor="middle" fill="${escapeXml(textColor)}" font-family="${escapeXml(fontFamily)}" font-size="18" font-weight="700">${slideNumber}/${totalSlides}</text>
  </g>`
      : ""
  }

  ${
    isOutroSlide
      ? `<!-- Outro Massive Watermark -->
  <text x="${width / 2}" y="${height * 0.72}" text-anchor="middle" fill="#ffffff" fill-opacity="0.06" font-family="${escapeXml(displayFont)}" font-size="150" font-weight="900" letter-spacing="6">
    ${escapeXml((outroWatermarkText || watermark).replace(/^@/, "").toUpperCase())}
  </text>`
      : ""
  }

  ${
    showDivider
      ? `<!-- Hairline Divider with Centered Logo Mark -->
  <g transform="translate(80, ${dividerY})">
    <line x1="0" y1="0" x2="${width / 2 - 120}" y2="0" stroke="#ffffff" stroke-opacity="0.4" stroke-width="1.5" />
    <rect x="${width / 2 - 95}" y="-16" width="32" height="32" rx="7" fill="${escapeXml(accentColor)}" />
    <text x="${width / 2 - 79}" y="6" text-anchor="middle" fill="#0a0908" font-family="${escapeXml(displayFont)}" font-size="20" font-weight="900">${escapeXml(logoMonogram)}</text>
    <line x1="${width / 2 - 40}" y1="0" x2="${width - 160}" y2="0" stroke="#ffffff" stroke-opacity="0.4" stroke-width="1.5" />
  </g>`
      : ""
  }

  <!-- Main Headline -->
  <g transform="translate(${isOutroSlide ? width / 2 : 80}, ${titleStartY})" ${hasImage ? 'filter="url(#textGlow)"' : ""}>
    ${titleLines
      .map(
        (line, idx) =>
          `<text x="0" y="${idx * titleLineHeight}" ${isOutroSlide ? 'text-anchor="middle"' : ""} fill="${escapeXml(textColor)}" font-family="${escapeXml(hasImage ? displayFont : fontFamily)}" font-size="${titleFontSize}" font-weight="900" letter-spacing="-0.5">${formatLineWithHighlights(line, highlightWords, accentColor)}</text>`
      )
      .join("\n    ")}
  </g>

  <!-- Subtitle / Body Content -->
  ${
    bodyLines.length > 0
      ? `<g transform="translate(${isOutroSlide ? width / 2 : 80}, ${bodyStartY})" ${hasImage ? 'filter="url(#textGlow)"' : ""}>
    ${bodyLines
      .map(
        (line, idx) =>
          `<text x="0" y="${idx * bodyLineHeight}" ${isOutroSlide ? 'text-anchor="middle"' : ""} fill="${escapeXml(textColor)}" fill-opacity="0.95" font-family="${escapeXml(fontFamily)}" font-size="${bodyFontSize}" font-weight="400">${formatLineWithHighlights(line, highlightWords, accentColor)}</text>`
      )
      .join("\n    ")}
  </g>`
      : ""
  }

  <!-- Footer Area -->
  ${
    isCarousel
      ? `<!-- Bottom Carousel Pagination Dots -->
  <g transform="translate(${width / 2}, ${height - 40})">
    ${Array.from({ length: totalSlides }, (_, i) => {
      const isCurrent = i + 1 === slideNumber;
      const dotX = (i - (totalSlides - 1) / 2) * 20;
      return `<circle cx="${dotX}" cy="0" r="${isCurrent ? 5 : 3.5}" fill="#ffffff" fill-opacity="${isCurrent ? 0.95 : 0.35}" />`;
    }).join("\n    ")}
  </g>`
      : ""
  }

  ${
    brandKit.showWatermark === false
      ? ""
      : `<!-- Footer Watermark -->
  <g transform="translate(80, ${height - 75})">
    ${!hasImage ? `<line x1="0" y1="0" x2="${width - 160}" y2="0" stroke="#ffffff" stroke-opacity="0.15" stroke-width="1.5" />` : ""}
    <text x="0" y="32" fill="${escapeXml(textColor)}" fill-opacity="0.75" font-family="${escapeXml(fontFamily)}" font-size="20" font-weight="700">${escapeXml(clampedWatermark)}</text>
    <text x="${width - 160}" y="32" text-anchor="end" fill="${escapeXml(accentColor)}" font-family="${escapeXml(fontFamily)}" font-size="16" font-weight="600">Joey Theme Studio</text>
  </g>`
  }
</svg>`;
}

/**
 * Renders an array of SVGs for a multi-slide carousel package.
 */
export function renderCarouselSlideSvgs(
  slides: Array<{
    title: string;
    body: string;
    tag?: string;
    imageUrl?: string;
    pipInsetUrl?: string;
    highlightWords?: string[];
    isOutroSlide?: boolean;
  }>,
  brandKit?: CardRenderOptions["brandKit"],
  aspectRatio: "1:1" | "4:5" = "1:1"
): string[] {
  return slides.map((slide, index) =>
    renderCardSvg({
      title: slide.title,
      body: slide.body,
      tag: slide.tag || (index === 0 ? "COVER" : index === slides.length - 1 ? "TAKEAWAY" : `POINT #${index}`),
      imageUrl: slide.imageUrl,
      pipInsetUrl: slide.pipInsetUrl,
      highlightWords: slide.highlightWords,
      isOutroSlide: slide.isOutroSlide ?? (index === slides.length - 1 && slides.length > 2),
      topBadge: index === 0 ? "swipe_pill" : "yellow_logo",
      showDividerMark: true,
      brandKit,
      aspectRatio,
      slideNumber: index + 1,
      totalSlides: slides.length,
    })
  );
}
