'use server';

import { getActiveTenantId } from "@/lib/auth";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { uploadBufferToR2, isR2Configured, assertAllowedUpload, R2_MAX_ASSET_BYTES } from "@/lib/storage";
import { generateText } from "ai";
import { resolveModelForTurn } from "@/lib/agent-model-resolver";

export interface VisualConceptSuggestion {
  text: string;
  preset: "mrbeast" | "shock" | "vs" | "clean" | "minimal" | "cyber";
  sticker: "arrow" | "question" | "circle" | "vs" | "badge_100" | "none";
  explanation: string;
}

export async function saveMediaStudioAsset(input: {
  base64Data: string;
  filename?: string;
  width?: number;
  height?: number;
}): Promise<{ success: boolean; publicUrl: string; assetId?: string; error?: string }> {
  try {
    const tenantId = await getActiveTenantId();

    const matches = input.base64Data.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return { success: false, publicUrl: "", error: "Invalid base64 image data" };
    }

    const mimeType = matches[1];
    const base64Content = matches[2];
    const buffer = Buffer.from(base64Content, "base64");

    const ext = mimeType.includes("png") ? "png" : "jpg";
    const filename = input.filename || `visual-hook-${Date.now()}.${ext}`;

    // Validate MIME type and extension against the site-wide allowlist
    assertAllowedUpload(filename, mimeType);

    // Enforce upload size cap (same limit as the regular asset upload path)
    if (buffer.length > R2_MAX_ASSET_BYTES) {
      return { success: false, publicUrl: "", error: "Image exceeds the 50 MB size limit" };
    }

    if (isR2Configured()) {
      const customKey = `${tenantId}/media-studio/${crypto.randomUUID()}.${ext}`;
      const { key, publicUrl } = await uploadBufferToR2(buffer, mimeType, tenantId, { customKey });

      const [asset] = await db
        .insert(assets)
        .values({
          tenantId,
          filename,
          key,
          mimeType,
          size: buffer.length,
          publicUrl,
          width: input.width ?? 1280,
          height: input.height ?? 720,
          tags: ["media-studio", "visual-hook"],
          altText: "Generated in Joey Media Studio",
        })
        .returning();

      return {
        success: true,
        publicUrl,
        assetId: asset.id,
      };
    } else {
      // In local dev without R2 credentials, return data URL safely
      return {
        success: true,
        publicUrl: input.base64Data,
      };
    }
  } catch (err: any) {
    console.error("[saveMediaStudioAsset] Error:", err);
    return {
      success: false,
      publicUrl: "",
      error: err instanceof Error ? err.message : "Failed to save visual hook asset",
    };
  }
}

export async function generateVisualHookSuggestions(
  postContent: string,
): Promise<{ suggestions: VisualConceptSuggestion[] }> {
  const cleanPost = postContent.trim();
  if (!cleanPost) {
    return {
      suggestions: [
        {
          text: "SECRET FORMULA",
          preset: "mrbeast",
          sticker: "arrow",
          explanation: "High curiosity gap to drive clicks.",
        },
        {
          text: "HOW TO SCALE?",
          preset: "shock",
          sticker: "question",
          explanation: "Asks an urgent question.",
        },
        {
          text: "BEFORE VS AFTER",
          preset: "vs",
          sticker: "vs",
          explanation: "Showcases transformation or comparison.",
        },
      ],
    };
  }

  try {
    const tenantId = await getActiveTenantId();
    const { model } = await resolveModelForTurn({ tenantId });
    const prompt = `You are a viral social media packaging expert specializing in YouTube thumbnails, X visual cards, and Instagram cover hooks.
Analyze this post:
"""${cleanPost}"""

Generate 3 diverse visual hook text overlays (MAX 3 WORDS EACH!) that COMPLEMENT the post text without repeating its exact words.
The visual text must create an irresistible curiosity gap or promise high value.

Respond ONLY with valid JSON in this structure:
{
  "suggestions": [
    {
      "text": "ALL CAPS 1-3 WORDS",
      "preset": "mrbeast" | "shock" | "vs" | "clean" | "cyber" | "minimal",
      "sticker": "arrow" | "question" | "circle" | "vs" | "badge_100" | "none",
      "explanation": "Brief rationale why this drives high CTR"
    }
  ]
}`;

    const { text } = await generateText({
      model,
      prompt,
    });

    const cleaned = text.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned);

    if (Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
      return { suggestions: parsed.suggestions.slice(0, 4) };
    }
  } catch (err) {
    console.warn("[generateVisualHookSuggestions] LLM failed, using heuristic fallbacks:", err);
  }

  // Algorithmic fallbacks
  const words = cleanPost.split(/\s+/).filter(Boolean);
  const fallbacks: VisualConceptSuggestion[] = [
    {
      text: "DON'T MISS THIS",
      preset: "mrbeast",
      sticker: "arrow",
      explanation: "Urgent callout to stop the feed scroll.",
    },
    {
      text: "IS THIS TRUE?",
      preset: "shock",
      sticker: "question",
      explanation: "Provocative question triggering debate.",
    },
    {
      text: "STEP BY STEP",
      preset: "clean",
      sticker: "none",
      explanation: "Promises structured tactical knowledge.",
    },
    {
      text: "10X RESULTS",
      preset: "cyber",
      sticker: "badge_100",
      explanation: "Highlights exponential growth and proof.",
    },
  ];

  return { suggestions: fallbacks };
}
