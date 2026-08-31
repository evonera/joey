import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const SENSITIVE_HEADER = /(?:authorization|proxy-authorization|cookie|token|secret|credential|api[-_]?key|bearer)/i;

export type OutboundRequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  allowPrivateHosts?: boolean;
};

export type OutboundResponse = {
  status: number;
  headers: IncomingHttpHeaders;
  buffer: Buffer;
  finalUrl: string;
};

export function stripSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !SENSITIVE_HEADER.test(name)));
}

function privateIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = octets;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && octets[2] === 100) ||
    (a === 203 && b === 0 && octets[2] === 113) ||
    a >= 224
  );
}

function mappedIpv4(address: string): string | undefined {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  const dotted = normalized.match(/^(?:0*:)*ffff:(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (dotted) return dotted.slice(1).join(".");
  const hex = normalized.match(/^(?:0*:)*ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return undefined;
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return `${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`;
}

export function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const mapped = mappedIpv4(normalized);
  if (mapped) return privateIpv4(mapped);
  if (isIP(normalized) === 4) return privateIpv4(normalized);
  if (isIP(normalized) !== 6) return true;
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("2001:db8:") ||
    normalized.startsWith("fd") || /^fe[89ab]/.test(normalized) || normalized.startsWith("ff");
}

export async function resolveOutboundTarget(input: string, signal?: AbortSignal, allowPrivateHosts = false) {
  if (signal?.aborted) throw signal.reason ?? new Error("Request aborted.");
  let url: URL;
  try { url = new URL(input); } catch { throw new Error("Invalid outbound URL."); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only HTTP and HTTPS URLs are allowed.");
  if (url.username || url.password) throw new Error("Credentials in outbound URLs are forbidden.");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!allowPrivateHosts && (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".lan"))) {
    throw new Error("Private outbound hostname is forbidden.");
  }
  const lookup = dnsLookup(hostname, { all: true, verbatim: true });
  let abortLookup: (() => void) | undefined;
  const aborted = signal && new Promise<never>((_resolve, reject) => {
    abortLookup = () => reject(signal.reason ?? new Error("Request aborted."));
    if (signal.aborted) abortLookup(); else signal.addEventListener("abort", abortLookup, { once: true });
  });
  let records: Awaited<typeof lookup>;
  try { records = aborted ? await Promise.race([lookup, aborted]) : await lookup; }
  finally { if (abortLookup) signal?.removeEventListener("abort", abortLookup); }
  if (!records.length) throw new Error("Outbound hostname resolved to no addresses.");
  if (!allowPrivateHosts && records.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Outbound hostname resolves to a private, link-local, or reserved address.");
  }
  return { url, address: records.find(({ family }) => family === 4)?.address ?? records[0].address };
}

function combineSignal(external: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Outbound request timed out.")), timeoutMs);
  const abort = () => controller.abort(external?.reason ?? new Error("Request aborted."));
  if (external?.aborted) abort(); else external?.addEventListener("abort", abort, { once: true });
  return { signal: controller.signal, cleanup: () => { clearTimeout(timeout); external?.removeEventListener("abort", abort); } };
}

async function requestHop(urlText: string, options: OutboundRequestOptions, signal: AbortSignal) {
  const { url, address } = await resolveOutboundTarget(urlText, signal, options.allowPrivateHosts);
  const requester = url.protocol === "https:" ? httpsRequest : httpRequest;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  return new Promise<{ status: number; headers: IncomingHttpHeaders; buffer: Buffer }>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, result?: { status: number; headers: IncomingHttpHeaders; buffer: Buffer }) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      if (error) reject(error); else resolve(result!);
    };
    const req = requester({
      protocol: url.protocol, hostname: url.hostname, port: url.port || undefined,
      path: `${url.pathname}${url.search}`, method: options.method ?? "GET", headers: options.headers,
      lookup: (_hostname, _options, callback) => callback(null, address, address.includes(":") ? 6 : 4),
    }, (response) => {
      const declared = Number(response.headers["content-length"] ?? 0);
      if (declared > maxBytes) { req.destroy(); finish(new Error(`Outbound response exceeds ${maxBytes} bytes.`)); return; }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) { req.destroy(); finish(new Error(`Outbound response exceeds ${maxBytes} bytes.`)); }
        else chunks.push(chunk);
      });
      response.on("end", () => finish(undefined, { status: response.statusCode ?? 0, headers: response.headers, buffer: Buffer.concat(chunks) }));
      response.on("error", (error) => finish(error));
    });
    const abort = () => { req.destroy(); finish(signal.reason instanceof Error ? signal.reason : new Error("Request aborted.")); };
    signal.addEventListener("abort", abort, { once: true });
    req.on("error", (error) => finish(error));
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

export async function outboundRequest(initialUrl: string, options: OutboundRequestOptions = {}): Promise<OutboundResponse> {
  const deadline = combineSignal(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let currentUrl = initialUrl;
  let method = options.method ?? "GET";
  let headers = { ...(options.headers ?? {}) };
  let body = options.body;
  try {
    for (let redirects = 0; redirects <= (options.maxRedirects ?? 5); redirects++) {
      const response = await requestHop(currentUrl, { ...options, method, headers, body }, deadline.signal);
      if (response.status < 300 || response.status >= 400) return { ...response, finalUrl: currentUrl };
      const location = Array.isArray(response.headers.location) ? response.headers.location[0] : response.headers.location;
      if (!location) throw new Error(`Redirect ${response.status} is missing a Location header.`);
      const nextUrl = new URL(location, currentUrl).toString();
      if (new URL(nextUrl).origin !== new URL(currentUrl).origin) { headers = stripSensitiveHeaders(headers); body = undefined; }
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === "POST")) { method = "GET"; body = undefined; }
      currentUrl = nextUrl;
    }
    throw new Error("Too many outbound redirects.");
  } finally { deadline.cleanup(); }
}
