import { defineNode } from "../../node-contract";
import { transcribeConfig } from "../../catalog";
import OpenAI from "openai";

const configSchema = transcribeConfig;

export const transcribeNode = defineNode({
  type: "ai.transcribe",
  category: "ai",
  label: "Transcribe",
  description:
    "Downloads an audio/video URL and transcribes it with OpenAI Whisper. Uses your OpenAI key; spend counts against budget.",
  inputs: ["media"],
  outputs: ["transcript"],
  configSchema,
  async execute(input, rawConfig, ctx) {
    const config = configSchema.parse(rawConfig);
    const apiKey = await resolveOpenAiKey(ctx.tenantId);

    const initialUrl = extractUrl(input, config.mediaUrlField);
    if (!initialUrl) throw new Error("No media URL found on the incoming data.");

    const { mediaResponse, finalUrl } = await fetchSafeMedia(initialUrl, ctx.signal);
    const blob = await mediaResponse.blob();
    if (blob.size > 25 * 1024 * 1024) {
      throw new Error("Media exceeds Whisper's 25MB limit.");
    }

    const { assertBudget } = await import("@/lib/usage");
    const budget = await assertBudget(ctx.tenantId);
    if (!budget.allowed) {
      throw new Error(
        `Monthly LLM budget reached ($${budget.costUsd.toFixed(2)} / $${budget.budgetUsd}). ` +
          "Raise the limit in Settings to keep flows running.",
      );
    }

    const client = new OpenAI({ apiKey });
    const transcription = await client.audio.transcriptions.create({
      model: "whisper-1",
      file: new File([blob], "media.mp4", { type: blob.type || "video/mp4" }),
      ...(config.language ? { language: config.language } : {}),
    });

    try {
      const { recordTokenUsage } = await import("@/lib/usage");
      await recordTokenUsage(ctx.tenantId, Math.ceil(blob.size / 1_000_000), 0);
    } catch {
      // ignore usage recording failures
    }

    return { output: { transcript: transcription.text, source: finalUrl } };
  },
});

function isPrivateIp(ip: string): boolean {
  // IPv4 checks
  const ipv4Match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [_, a, b] = ipv4Match.map(Number);
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 (loopback)
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (private)
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 (private)
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  // IPv6 checks
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // ULA
  if (normalized.startsWith("fe80")) return true; // link-local
  if (
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.") ||
    normalized.startsWith("::ffff:169.254.")
  ) {
    return true;
  }
  return false;
}

export async function validateSafeUrl(urlStr: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error("Invalid media URL format.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Invalid URL protocol. Only http: and https: are allowed.");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan") ||
    hostname === "0.0.0.0"
  ) {
    throw new Error("Target media hostname is forbidden.");
  }

  if (isPrivateIp(hostname)) {
    throw new Error("Private or link-local destination IP address is forbidden.");
  }

  const dns = await import("dns/promises");
  try {
    const lookups = await dns.lookup(hostname, { all: true });
    for (const { address } of lookups) {
      if (isPrivateIp(address)) {
        throw new Error(`Hostname resolves to private IP (${address}). Access forbidden.`);
      }
    }
  } catch (dnsErr: any) {
    if (dnsErr.message?.includes("forbidden")) throw dnsErr;
    throw new Error(`Failed to resolve media hostname: ${dnsErr.message}`);
  }

  return parsed;
}

export async function fetchSafeMedia(
  initialUrl: string,
  signal?: AbortSignal,
): Promise<{ mediaResponse: Response; finalUrl: string }> {
  let currentUrl = initialUrl;
  let redirects = 0;
  const maxRedirects = 5;

  while (redirects <= maxRedirects) {
    await validateSafeUrl(currentUrl);

    const res = await fetch(currentUrl, {
      method: "GET",
      redirect: "manual",
      signal,
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        throw new Error(`Redirect response (${res.status}) missing location header.`);
      }
      currentUrl = new URL(location, currentUrl).toString();
      redirects++;
      continue;
    }

    if (!res.ok) {
      throw new Error(`Failed to download media (${res.status}).`);
    }

    return { mediaResponse: res, finalUrl: currentUrl };
  }

  throw new Error("Too many redirects when downloading media.");
}

function extractUrl(input: unknown, field?: string): string | undefined {
  if (field) {
    return getPath(input, field) as string | undefined;
  }
  if (typeof input === "string" && /^https?:\/\//.test(input)) return input;
  if (input && typeof input === "object") {
    for (const key of ["videoUrl", "url", "mediaUrl", "video_url", "fileUrl"]) {
      const v = (input as Record<string, unknown>)[key];
      if (typeof v === "string") return v;
    }
  }
  return undefined;
}

function getPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), obj);
}

async function resolveOpenAiKey(tenantId: string): Promise<string> {
  const { db } = await import("@/lib/db");
  const { apiKeys } = await import("@/lib/db/schema");
  const { eq, and } = await import("drizzle-orm");
  const { decrypt } = await import("@/lib/crypto");
  const key = await db.query.apiKeys.findFirst({
    where: and(
      eq(apiKeys.tenantId, tenantId),
      eq(apiKeys.provider, "openai"),
      eq(apiKeys.status, "active"),
    ),
  });
  if (key?.encryptedKey) return decrypt(key.encryptedKey);
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  throw new Error("No OpenAI API key available for transcription.");
}
