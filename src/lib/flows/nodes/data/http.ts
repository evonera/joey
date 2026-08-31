import { httpConfig } from "../../catalog";
import { defineNode } from "../../node-contract";
import { outboundRequest, stripSensitiveHeaders } from "../../outbound-request";

function interpolate(value: string, input: unknown): string {
  return value.replaceAll("{{input}}", typeof input === "string" ? input : JSON.stringify(input));
}

export const httpNode = defineNode({
  type: "data.http", category: "data", label: "HTTP Request",
  description: "Calls a REST API with bounded, DNS-pinned SSRF-safe requests.",
  inputs: ["input"], outputs: ["response"], configSchema: httpConfig,
  async execute(input, rawConfig, ctx) {
    const config = httpConfig.parse(rawConfig);
    const url = interpolate(config.url, input);
    let headers: Record<string, string> = {};
    if (config.headersJson?.trim()) {
      try { headers = JSON.parse(config.headersJson) as Record<string, string>; }
      catch { throw new Error("HTTP headers must be a JSON object."); }
    }
    const dynamicOrigin = config.url.includes("{{input}}") && !/^https?:\/\/[^/{]+\//.test(config.url.split("{{input}}")[0]);
    if (dynamicOrigin) headers = stripSensitiveHeaders(headers);
    const body = dynamicOrigin || config.method === "GET" || !config.bodyJson ? undefined : interpolate(config.bodyJson, input);
    const response = await outboundRequest(url, {
      method: config.method, headers, body, signal: ctx.signal,
      maxBytes: config.maxResponseBytes, timeoutMs: config.timeoutMs,
    });
    const text = response.buffer.toString("utf8");
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
    try { return { output: JSON.parse(text) as unknown }; } catch { return { output: text }; }
  },
});
