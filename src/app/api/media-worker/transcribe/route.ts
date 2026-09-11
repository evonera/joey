import { z } from "zod";
import { readWorkerBody } from "@/lib/media-engine/request-body";
import { verifyWorkerRequest } from "@/lib/media-engine/auth";
import { transcribeRender } from "@/lib/media-engine/transcription";
export const maxDuration = 180;
export async function POST(request: Request) {
  const body = await readWorkerBody(request, 1024);
  if (body === null || !verifyWorkerRequest(body, request.headers.get("x-render-timestamp"), request.headers.get("x-render-signature"))) return new Response("Unauthorized", { status: 401 });
  let json;
  try { json = JSON.parse(body); } catch { return new Response("Invalid JSON", { status: 400 }); }
  const parsed = z.object({ jobId: z.uuid(), attemptToken: z.uuid() }).strict().safeParse(json);
  if (!parsed.success) return new Response("Invalid transcription request", { status: 400 });
  try { return Response.json(await transcribeRender(parsed.data.jobId, parsed.data.attemptToken)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Transcription failed" }, { status: 409 }); }
}
