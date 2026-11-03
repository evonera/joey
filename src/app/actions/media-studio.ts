'use server';

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { uploadBufferToR2, isR2Configured, assertAllowedUpload, R2_MAX_ASSET_BYTES } from "@/lib/storage";
import { generateText } from "ai";
import { z } from "zod";
import { resolveModelForTurn } from "@/lib/agent-model-resolver";
import { reserveUsageBudget, settleUsageReservation, failUsageReservation } from "@/lib/usage";
import { estimateTextCallCost, getTextModelCost } from "@/lib/ai-pricing";

export interface VisualConceptSuggestion {
  text: string;
  preset: "mrbeast" | "shock" | "vs" | "clean" | "minimal" | "cyber";
  sticker: "arrow" | "question" | "circle" | "vs" | "badge_100" | "none";
  explanation: string;
}

function isValidBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value);
}

function assertJpegBytes(buffer: Buffer): void {
  // Media Studio currently exports JPEG only. Verify the decoded bytes instead
  // of trusting a caller-controlled data URL MIME type before public storage.
  if (buffer.length < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
    throw new Error("Visual hook data is not a valid JPEG image");
  }
}

export async function saveMediaStudioAsset(input: {
  base64Data: string;
  filename?: string;
  width?: number;
  height?: number;
}): Promise<{ success: boolean; publicUrl: string; assetId?: string; error?: string }> {
  try {
    const tenantId = await requireRole(["owner", "admin", "editor", "member"]);

    const matches = input.base64Data.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return { success: false, publicUrl: "", error: "Invalid base64 image data" };
    }

    const mimeType = matches[1].toLowerCase();
    const base64Content = matches[2];
    if (mimeType !== "image/jpeg" || !isValidBase64(base64Content)) {
      return { success: false, publicUrl: "", error: "Media Studio accepts JPEG image data only" };
    }
    const buffer = Buffer.from(base64Content, "base64");
    assertJpegBytes(buffer);

    const ext = "jpg";
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
  const cleanPost = postContent.trim().slice(0, 20_000);
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

  const tenantId = await requireRole(["owner", "admin", "editor", "member"]);
  try {
    const { model, providerModelId, trialGenerationLimit } = await resolveModelForTurn({ tenantId });
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

    const reservation = await reserveUsageBudget({ tenantId, kind: "text", modelId: providerModelId, trialGenerationLimit,
      estimatedCostUsd: estimateTextCallCost(providerModelId, prompt, 512), metadata: { source: "visual_hook" } });
    let text: string;
    try {
      const result = await generateText({ model, prompt, maxOutputTokens: 512, maxRetries: 0, abortSignal: AbortSignal.timeout(30_000) });
      await settleUsageReservation({ id: reservation.id, inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0,
        actualCostUsd: getTextModelCost(providerModelId, result.usage.inputTokens ?? 0, result.usage.outputTokens ?? 0) });
      text = result.text;
    } catch (error) {
      await failUsageReservation(reservation.id, { reason: "Visual hook generation did not complete." });
      throw error;
    }

    const cleaned = text.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = z.object({ suggestions: z.array(z.object({
      text: z.string().trim().min(1).max(80),
      preset: z.enum(["mrbeast", "shock", "vs", "clean", "minimal", "cyber"]),
      sticker: z.enum(["arrow", "question", "circle", "vs", "badge_100", "none"]),
      explanation: z.string().trim().min(1).max(500),
    }).strict()).min(1).max(4) }).strict().parse(JSON.parse(cleaned));
    return parsed;
  } catch (err) {
    console.error("[generateVisualHookSuggestions] generation failed:", err);
    throw new Error("Could not generate suggestions. Check your AI provider and workspace usage limits, then try again.");
  }
}
