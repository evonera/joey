import { NextResponse } from "next/server";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { scouts } from "@/lib/db/schema";
import { authenticateApiRequest, requireScope, withRateLimitHeaders } from "@/lib/api-auth";
import { apiErrorResponse } from "@/lib/api-error-response";

export async function GET(request: Request) {
  let rateLimit;
  try {
    const auth = await authenticateApiRequest(request); rateLimit = auth.rateLimit;
    requireScope(auth.scopes, "read");
    const scoutId = new URL(request.url).searchParams.get("scoutId");
    if (scoutId && !z.uuid().safeParse(scoutId).success) return withRateLimitHeaders(NextResponse.json({ error: "Invalid Scout ID." }, { status: 400 }), rateLimit);
    const rows = await db.query.scouts.findMany({ where: and(eq(scouts.tenantId, auth.tenantId), ...(scoutId ? [eq(scouts.id, scoutId)] : [])), columns: { id: true, name: true, platform: true, targetUrl: true, goalCondition: true, isActive: true, pollIntervalMinutes: true }, orderBy: [desc(scouts.createdAt)], limit: 100 });
    return withRateLimitHeaders(NextResponse.json({ scouts: rows }), rateLimit);
  } catch (error) { return apiErrorResponse(error, rateLimit); }
}
