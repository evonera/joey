import { readWorkerBody } from "@/lib/media-engine/request-body";
import { verifyWorkerRequest } from "@/lib/media-engine/auth";
import { completionSchema, completeRenderJob } from "@/lib/media-engine/worker-jobs";
export async function POST(request: Request) {
  const body = await readWorkerBody(request, 8192);
  if (body === null || !verifyWorkerRequest(body, request.headers.get("x-render-timestamp"), request.headers.get("x-render-signature"))) return new Response("Unauthorized", { status: 401 });
  let input;
  try { input = completionSchema.parse(JSON.parse(body)); } catch { return new Response("Invalid completion", { status: 400 }); }
  return Response.json(await completeRenderJob(input));
}
