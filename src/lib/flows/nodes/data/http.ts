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
        : (() => {
            // Merge {{input}}-less bodies that reference fields via dot paths? Keep simple: raw body.
            return config.bodyJson;
          })();
      if (body !== undefined && !headers["Content-Type"] && !headers["content-type"]) {
        headers["Content-Type"] = "application/json";
        try { JSON.parse(body); } catch { /* leave as raw text */ }
      }
    }

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
  },
});
