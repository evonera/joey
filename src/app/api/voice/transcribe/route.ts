import { getActiveTenant } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { MAX_VOICE_BYTES, VOICE_MEDIA_TYPES, transcribeVoice } from "@/lib/voice-transcription";

export const maxDuration = 45;
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return Response.json({ error: "Use voice input from your Joey workspace." }, { status: 403 });
  let tenantId: string, userId: string;
  try { const active = await getActiveTenant(); tenantId = active.tenantId; userId = active.user.id; }
  catch { return Response.json({ error: "Sign in to use voice input." }, { status: 401 }); }
  const rate = await checkRateLimit(`voice:${tenantId}:${userId}`, 6);
  if (!rate.allowed) return Response.json({ error: "Too many voice recordings. Try again in a minute." }, { status: 429 });
  const mediaType = request.headers.get("content-type")?.split(";")[0].trim() || "";
  if (!VOICE_MEDIA_TYPES.has(mediaType)) return Response.json({ error: "Unsupported recording format." }, { status: 415 });
  if (Number(request.headers.get("content-length")) > MAX_VOICE_BYTES) return Response.json({ error: "Recording is too large." }, { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "No voice recording received." }, { status: 400 });
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const item = await reader.read(); if (item.done) break;
      size += item.value.byteLength;
      if (size > MAX_VOICE_BYTES) { await reader.cancel(); return Response.json({ error: "Recording is too large." }, { status: 413 }); }
      chunks.push(item.value);
    }
  } catch { return Response.json({ error: "Recording upload was interrupted." }, { status: 400 }); }
  finally { reader.releaseLock(); }
  const audio = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { audio.set(chunk, offset); offset += chunk.byteLength; }
  try { return Response.json(await transcribeVoice(tenantId, audio, mediaType, request.signal)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Voice transcription failed." }, { status: 422 }); }
}
