import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";

export interface ExaSearchOptions {
  query: string;
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  category?: string;
  type?: "neural" | "fast" | "deep";
  startPublishedDate?: string;
  signal?: AbortSignal;
}

export interface ExaSearchResultItem {
  id: string;
  title: string;
  url: string;
  publishedDate?: string;
  author?: string;
  heroImage?: string;
  imageLinks: string[];
  text?: string;
  highlights: string[];
}

export interface ExaSearchResponse {
  results: ExaSearchResultItem[];
  images: string[];
}

export async function resolveExaKey(tenantId?: string | null): Promise<string> {
  if (tenantId) {
    const tenantKey = await db.query.apiKeys.findFirst({
      where: and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.provider, "exa")),
    });

    if (tenantKey) {
      if (tenantKey.status !== "active") {
        throw new Error("Exa API key for this workspace is disabled or revoked.");
      }
      return decrypt(tenantKey.encryptedKey);
    }
  }

  if (process.env.EXA_API_KEY) {
    return process.env.EXA_API_KEY;
  }

  throw new Error(
    "No Exa API key configured. Please add one in Settings → Integrations (provider: exa).",
  );
}

export async function searchWithExa(
  options: ExaSearchOptions,
  tenantId?: string | null,
): Promise<ExaSearchResponse> {
  const apiKey = await resolveExaKey(tenantId);
  const numResults = options.numResults ?? 8;

  const bodyPayload: Record<string, unknown> = {
    query: options.query,
    type: options.type ?? "neural",
    numResults,
    contents: {
      text: { maxCharacters: 3000 },
      highlights: true,
      extras: { imageLinks: 3 },
    },
  };

  if (options.category && options.category !== "general") {
    bodyPayload.category = options.category;
  }

  if (options.includeDomains && options.includeDomains.length > 0) {
    bodyPayload.includeDomains = options.includeDomains;
  }

  if (options.excludeDomains && options.excludeDomains.length > 0) {
    bodyPayload.excludeDomains = options.excludeDomains;
  }

  if (options.startPublishedDate) {
    bodyPayload.startPublishedDate = options.startPublishedDate;
  }

  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(bodyPayload),
    signal: options.signal,
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(`Exa search failed (${response.status}): ${errBody.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    results?: Array<{
      id?: string;
      title?: string | null;
      url?: string;
      publishedDate?: string;
      author?: string;
      image?: string;
      extras?: { imageLinks?: string[] };
      text?: string;
      highlights?: string[];
    }>;
  };

  const rawResults = data.results || [];
  const allImages = new Set<string>();

  const results: ExaSearchResultItem[] = rawResults.map((item, idx) => {
    const heroImage =
      typeof item.image === "string" && item.image.startsWith("http")
        ? item.image
        : undefined;

    if (heroImage) allImages.add(heroImage);

    const imageLinks: string[] = [];
    if (Array.isArray(item.extras?.imageLinks)) {
      for (const link of item.extras.imageLinks) {
        if (typeof link === "string" && link.startsWith("http")) {
          imageLinks.push(link);
          allImages.add(link);
        }
      }
    }

    return {
      id: item.id || `exa_res_${idx + 1}`,
      title: item.title || "Untitled",
      url: item.url || "",
      publishedDate: item.publishedDate,
      author: item.author,
      heroImage,
      imageLinks,
      text: item.text,
      highlights: Array.isArray(item.highlights) ? item.highlights : [],
    };
  });

  return {
    results,
    images: Array.from(allImages),
  };
}
