import { createHmac } from "node:crypto";

/** Best-effort wake-up after the database commit; polling recovers dispatch loss. */
export async function dispatchQueuedRender(jobId: string) {
  const endpoint = process.env.MEDIA_WORKER_DISPATCH_URL;
  const secret = process.env.MEDIA_WORKER_SECRET;
  if (!endpoint || !secret || secret.length < 32) return;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".modal.run")) throw new Error("Invalid media worker endpoint");
    const body = JSON.stringify({ jobId });
    const timestamp = String(Date.now());
    const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    const response = await fetch(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(5000), headers: { "content-type": "application/json", "x-render-timestamp": timestamp, "x-render-signature": signature }, body });
    if (!response.ok) throw new Error("Worker dispatch failed");
  } catch {
    console.warn("[media-engine] Immediate dispatch unavailable; scheduled recovery will claim queued jobs.");
  }
}
