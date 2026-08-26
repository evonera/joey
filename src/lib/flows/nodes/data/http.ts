import { defineNode } from "../../node-contract";
import { httpConfig } from "../../catalog";

function template(text: string, input: unknown): string {
  if (!text.includes("{{input}}")) return text;
  const asText =
    typeof input === "string" ? input : JSON.stringify(input);
  return text.replaceAll("{{input}}", asText);
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

    if (config.allowPrivateHosts) {
      // Trusted opt-out: plain fetch (LAN/self-host APIs). Only for users who
      // explicitly enable it — webhook-reachable flows should stay safe.
      const response = await fetch(url, {
        method: config.method,
        headers,
        ...(body !== undefined ? { body } : {}),
        signal: ctx.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${url}: ${text.slice(0, 300)}`);
      }
      let parsed: unknown = text;
      try { parsed = JSON.parse(text); } catch { /* keep text */ }
      return { output: parsed };
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

    try {
      let currentUrl = url;
      let redirects = 0;
      while (redirects <= 5) {
        const { status, headers: resHeaders, buffer } = await safeRequest(currentUrl, {
          method: config.method,
          headers,
          body,
          signal: abortCtrl.signal,
          timeoutMs: 60_000,
        });

        if (status >= 300 && status < 400) {
          const location = Array.isArray(resHeaders.location) ? resHeaders.location[0] : resHeaders.location;
          if (!location) throw new Error(`Redirect response (${status}) missing location header.`);
          currentUrl = new URL(location, currentUrl).toString();
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
