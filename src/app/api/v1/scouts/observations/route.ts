import { NextResponse } from "next/server";
import { authenticateApiRequest, requireScope, withRateLimitHeaders } from "@/lib/api-auth";
import { apiErrorResponse } from "@/lib/api-error-response";
import { readBoundedJson } from "@/lib/http/read-bounded-json";
import { connectorObservationSchema, receiveConnectorObservation } from "@/lib/scouts/connector";

export async function POST(request: Request) {
  let rateLimit;
  try {
    const auth = await authenticateApiRequest(request); rateLimit = auth.rateLimit;
    requireScope(auth.scopes, "write");
    const body = await readBoundedJson(request, 128 * 1024);
    if (!body.ok) return withRateLimitHeaders(NextResponse.json({ error: body.reason === "too_large" ? "Observation exceeds 128 KiB." : "Invalid JSON." }, { status: body.reason === "too_large" ? 413 : 400 }), rateLimit);
    const parsed = connectorObservationSchema.safeParse(body.value);
    if (!parsed.success) return withRateLimitHeaders(NextResponse.json({ error: "Use version 1 with a saved Scout source and at most 15 real post observations. Unknown metrics must be omitted." }, { status: 400 }), rateLimit);
    try { return withRateLimitHeaders(NextResponse.json(await receiveConnectorObservation(auth.tenantId, parsed.data), { status: 202 }), rateLimit); }
    catch (error) { return withRateLimitHeaders(NextResponse.json({ error: error instanceof Error ? error.message : "Observation could not be accepted." }, { status: 409 }), rateLimit); }
  } catch (error) { return apiErrorResponse(error, rateLimit); }
}
