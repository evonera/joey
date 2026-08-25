import { defineNode } from "../../node-contract";
import { transcribeConfig } from "../../catalog";
import OpenAI from "openai";
import { request as httpRequest } from "http";
import { request as httpsRequest } from "https";

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

    const { buffer, contentType, finalUrl } = await fetchSafeMedia(initialUrl, ctx.signal);
    if (buffer.length > 25 * 1024 * 1024) {
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
      file: new File([buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer], "media.mp4", { type: contentType || "video/mp4" }),
      ...(config.language ? { language: config.language } : {}),
    });

    try {
      const { recordTokenUsage } = await import("@/lib/usage");
      await recordTokenUsage(ctx.tenantId, Math.ceil(buffer.length / 1_000_000), 0);
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
  const mappedIpv4 = normalized.match(/^::ffff:(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (mappedIpv4 && isPrivateIp(mappedIpv4.slice(1).join("."))) {
    return true;
  }
  return false;
}

export type SafeMediaTarget = { url: URL; ip: string };

/**
 * Validates a URL AND binds the decision to a concrete, freshly resolved IP.
 * The caller must connect to this exact IP (with the Host header) so a DNS
 * rebinding attack cannot swap the hostname to an internal address after the
 * check — the checked address IS the connection address.
 */
export async function validateSafeUrl(urlStr: string): Promise<SafeMediaTarget> {
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
  let resolvedIp: string | undefined;
  try {
    const lookups = await dns.lookup(hostname, { all: true, verbatim: true });
    // Prefer a globally routable IPv4; any private/mapped result is rejected.
    for (const { address } of lookups) {
      if (isPrivateIp(address)) {
        throw new Error(`Hostname resolves to private IP (${address}). Access forbidden.`);
      }
      if (!resolvedIp && !address.includes(":")) resolvedIp = address;
    }
    resolvedIp ??= lookups[0]?.address;
  } catch (dnsErr: any) {
    if (dnsErr.message?.includes("forbidden")) throw dnsErr;
    throw new Error(`Failed to resolve media hostname: ${dnsErr.message}`);
  }
  if (!resolvedIp) {
    throw new Error("Failed to resolve media hostname (no addresses).");
  }

  return { url: parsed, ip: resolvedIp };
}

export type SafeMediaResult = { buffer: Buffer; contentType: string; finalUrl: string };

/**
 * Downloads media with SSRF-safe, TLS-safe semantics:
 * - DNS is resolved ONCE and validated (private/metadata ranges rejected).
 * - The validated IP is passed to Node's request `lookup` option, so the
 *   connection goes to exactly that IP (no rebinding)…
 * - …while hostname, SNI and certificate validation still use the original
 *   hostname — normal HTTPS certificates work.
 * Redirects are followed manually and each hop re-validates its own IP.
 */
export type SafeRequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  /** Hard cap on the buffered body (bytes). Default 25MB. */
  maxBytes?: number;
  /** Hard cap on request duration (ms). Default 60s. */
  timeoutMs?: number;
};

export type SafeRequestResult = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  buffer: Buffer;
};

/**
 * SSRF-safe, TLS-safe HTTP request:
 * - DNS resolved ONCE and validated (private/metadata ranges rejected).
 * - Connection pinned to the validated IP via `lookup`…
 * - …while hostname, SNI and certificate validation use the real hostname.
 * Throws on non-2xx; caller decides redirect handling.
 */
export async function safeRequest(
  urlStr: string,
  opts: SafeRequestOptions = {},
): Promise<SafeRequestResult> {
  const { url, ip } = await validateSafeUrl(urlStr);
  const isHttps = url.protocol === "https:";
  const requester = isHttps ? httpsRequest : httpRequest;
  const maxBytes = opts.maxBytes ?? 25 * 1024 * 1024;
  const timeoutMs = opts.timeoutMs ?? 60_000;

  return new Promise<SafeRequestResult>((resolve, reject) => {
    const req = requester(
      {
        protocol: url.protocol,
        hostname: url.hostname, // TLS/SNI + Host use the real hostname
        port: url.port ? Number(url.port) : isHttps ? 443 : 80,
        path: `${url.pathname}${url.search}`,
        method: opts.method ?? "GET",
        // Pin the connection to the validated IP; TLS still validates the hostname.
        lookup: (_host: string, _o: unknown, cb: (err: Error | null, address: string, family: number) => void) =>
          cb(null, ip, ip.includes(":") ? 6 : 4),
        headers: opts.headers ?? {},
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        let done = false;
        const fail = (err: Error) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          req.destroy();
          reject(err);
        };
        const timer = setTimeout(() => fail(new Error("Request timed out.")), timeoutMs);
        res.on("data", (c: Buffer) => {
          if (done) return;
          total += c.length;
          if (total > maxBytes) {
            fail(new Error(`Response exceeded the ${maxBytes} byte limit.`));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            buffer: Buffer.concat(chunks),
          });
        });
        res.on("error", (err) => fail(err));
      },
    );
    req.on("error", (err) => reject(err));
    const signal = opts.signal;
    if (signal) {
      const abort = () => req.destroy(new Error("Aborted"));
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
    }
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

export async function fetchSafeMedia(
  initialUrl: string,
  signal?: AbortSignal,
): Promise<SafeMediaResult> {
  let currentUrl = initialUrl;
  let redirects = 0;
  const maxRedirects = 5;

  while (redirects <= maxRedirects) {
    const { status, headers, buffer } = await safeRequest(currentUrl, {
      method: "GET",
      signal,
    });

    if (status >= 300 && status < 400) {
      const location = Array.isArray(headers.location) ? headers.location[0] : headers.location;
      if (!location) {
        throw new Error(`Redirect response (${status}) missing location header.`);
      }
      currentUrl = new URL(location, currentUrl).toString();
      redirects++;
      continue;
    }

    if (status < 200 || status >= 300) {
      throw new Error(`Failed to download media (${status}).`);
    }

    const contentType =
      (Array.isArray(headers["content-type"]) ? headers["content-type"][0] : headers["content-type"]) ??
      "application/octet-stream";
    return { buffer, contentType, finalUrl: currentUrl };
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
  const tenantKey = await db.query.apiKeys.findFirst({
    where: and(
      eq(apiKeys.tenantId, tenantId),
      eq(apiKeys.provider, "openai"),
    ),
  });
  if (tenantKey) {
    if (tenantKey.status !== "active") {
      throw new Error("OpenAI API key for this workspace is revoked or disabled.");
    }
    return decrypt(tenantKey.encryptedKey);
  }
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  throw new Error("No OpenAI API key available for transcription.");
}
