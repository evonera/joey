import { createHmac, timingSafeEqual } from "node:crypto";
export function verifyWorkerRequest(body: string, timestamp: string | null, signature: string | null) {
  const key = process.env.MEDIA_WORKER_SECRET;
  if (!key || key.length < 32 || !timestamp || !signature || !/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 300_000) return false;
  const expected = createHmac("sha256", key).update(`${timestamp}.${body}`).digest("hex");
  const received = Buffer.from(signature);
  return received.length === expected.length && timingSafeEqual(received, Buffer.from(expected));
}
