import { readWorkerBody } from "@/lib/media-engine/request-body";
import { verifyWorkerRequest } from "@/lib/media-engine/auth";
import { claimRenderJob } from "@/lib/media-engine/worker-jobs";
export async function POST(request: Request) {
  const body = await readWorkerBody(request, 1024);
  if (body === null || !verifyWorkerRequest(body, request.headers.get("x-render-timestamp"), request.headers.get("x-render-signature"))) return new Response("Unauthorized", { status: 401 });
  return Response.json({ job: await claimRenderJob() });
}
