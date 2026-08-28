import { defineNode } from "../../node-contract";
import { httpConfig } from "../../catalog";

function template(text: string, input: unknown): string {
  if (!text.includes("{{input}}")) return text;
  const asText =
    typeof input === "string" ? input : JSON.stringify(input);
  return text.replaceAll("{{input}}", asText);
}

async function readBoundedText(response: Response, maxBytes = 10 * 1024 * 1024): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new Error("HTTP response exceeds the 10MB limit.");
      chunks.push(value);
    }
  } finally {
    if (bytes > maxBytes) await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export const httpNode = defineNode({
  type: "data.http",
  category: "data",
  label: "HTTP Request",
  description: "Calls any REST API — the universal integration escape hatch.",
  inputs: ["input"],
  outputs: ["response"],
  configSchema: httpConfig,
  async execute(input, rawConfig, ctx) {
    const config = httpConfig.parse(rawConfig);

    const url = template(config.url, input);

    let headers: Record<string, string> = {};
    if (config.headersJson?.trim()) {
      try {
        headers = JSON.parse(config.headersJson);
      } catch {
        throw new Error("Headers are not valid JSON.");
      }
    }

    let body: string | undefined;
    if (config.bodyJson?.trim() && config.method !== "GET") {
      body = config.bodyJson.includes("{{input}}")
        ? template(config.bodyJson, input)
        : config.bodyJson;
      if (!headers["Content-Type"] && !headers["content-type"]) {
        headers["Content-Type"] = "application/json";
        try { JSON.parse(body); } catch { /* leave as raw text */ }
      }
    }

    const hasDynamicUrl = config.url.includes("{{input}}");
    if (config.allowPrivateHosts && !hasDynamicUrl) {
      // Trusted opt-out for static LAN/self-host APIs. It still receives the
      // same deadline, cancellation propagation, and response bound as public
      // requests; only private-address rejection is bypassed.
      const abortCtrl = new AbortController();
      const timer = setTimeout(() => abortCtrl.abort(new Error("HTTP request timed out.")), 60_000);
      const onExternalAbort = () => abortCtrl.abort(ctx.signal?.reason ?? new Error("Aborted"));
      if (ctx.signal) {
        if (ctx.signal.aborted) onExternalAbort();
        else ctx.signal.addEventListener("abort", onExternalAbort, { once: true });
      }
      try {
        const response = await fetch(url, { method: config.method, headers, ...(body !== undefined ? { body } : {}), signal: abortCtrl.signal });
        const text = await readBoundedText(response);
        if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}: ${text.slice(0, 300)}`);
        let parsed: unknown = text;
        try { parsed = JSON.parse(text); } catch { /* keep text */ }
        return { output: parsed };
      } finally {
        clearTimeout(timer);
        if (ctx.signal) ctx.signal.removeEventListener("abort", onExternalAbort);
      }
    }

    // SSRF-safe path: DNS-pinned, private/metadata destinations rejected,
    // redirects re-validated per hop (max 5) within a single overall 60s timeout.
    const { safeRequest } = await import("../ai/transcribe");
    const abortCtrl = new AbortController();
    const timer = setTimeout(() => {
      abortCtrl.abort(new Error("HTTP request timed out."));
    }, 60_000);

    const onExternalAbort = () => {
      abortCtrl.abort(ctx.signal?.reason ?? new Error("Aborted"));
    };
    if (ctx.signal) {
      if (ctx.signal.aborted) onExternalAbort();
      else ctx.signal.addEventListener("abort", onExternalAbort, { once: true });
    }

    const stripCredentials = (hdrs: Record<string, string>): Record<string, string> => {
      const safe: Record<string, string> = {};
      for (const [k, v] of Object.entries(hdrs)) {
        const lower = k.toLowerCase();
        if (
          !lower.includes("auth") &&
          !lower.includes("key") &&
          !lower.includes("token") &&
          !lower.includes("secret") &&
          !lower.includes("cookie") &&
          !lower.includes("credential") &&
          !lower.includes("bearer")
        ) {
          safe[k] = v;
        }
      }
      return safe;
    };

    try {
      let currentUrl = url;
      let currentHeaders = { ...headers };
      let currentMethod = config.method;
      let currentBody = body;

      // Extract expected origin if config.url has a static base host (e.g. https://api.mysite.com/{{path}})
      let expectedOrigin: string | null = null;
      try {
        if (config.url) {
          const templateIndex = config.url.indexOf("{{");
          if (templateIndex === -1) {
            expectedOrigin = new URL(config.url).origin;
          } else {
            const prefix = config.url.substring(0, templateIndex);
            if (prefix.startsWith("http://") || prefix.startsWith("https://")) {
              expectedOrigin = new URL(prefix).origin;
            }
          }
        }
      } catch {}

      const initialOrigin = new URL(url).origin;
      // If the URL host was dynamically supplied by runtime input (no fixed base host configured)
      // OR if the interpolated origin differs from the expected configured origin, strip sensitive credentials
      if (!expectedOrigin || initialOrigin !== expectedOrigin) {
        currentHeaders = stripCredentials(currentHeaders);
      }
      let redirects = 0;
      while (redirects <= 5) {
        const { status, headers: resHeaders, buffer } = await safeRequest(currentUrl, {
          method: currentMethod,
          headers: currentHeaders,
          body: currentBody,
          signal: abortCtrl.signal,
          timeoutMs: 60_000,
        });

        if (status >= 300 && status < 400) {
          const location = Array.isArray(resHeaders.location) ? resHeaders.location[0] : resHeaders.location;
          if (!location) throw new Error(`Redirect response (${status}) missing location header.`);
          const nextUrl = new URL(location, currentUrl);
          if (nextUrl.origin !== initialOrigin) {
            // Strip sensitive credentials and tokens on cross-origin redirects
            currentHeaders = stripCredentials(currentHeaders);
            // Prevent request body disclosure across origins
            currentBody = undefined;
          }
          if (status === 303 || ((status === 301 || status === 302) && currentMethod === "POST")) {
            currentMethod = "GET";
            currentBody = undefined;
          }
          currentUrl = nextUrl.toString();
          redirects++;
          continue;
        }
        if (status < 200 || status >= 300) {
          throw new Error(`HTTP ${status} from ${url}: ${buffer.toString("utf8").slice(0, 300)}`);
        }

        const text = buffer.toString("utf8");
        let parsed: unknown = text;
        try { parsed = JSON.parse(text); } catch { /* keep text */ }
        return { output: parsed };
      }
      throw new Error("Too many redirects.");
    } finally {
      clearTimeout(timer);
      if (ctx.signal) ctx.signal.removeEventListener("abort", onExternalAbort);
    }
  },
});
