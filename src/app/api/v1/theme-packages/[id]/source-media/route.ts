import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest, requireScope, withRateLimitHeaders } from "@/lib/api-auth";
import { apiErrorResponse } from "@/lib/api-error-response";
import { readBoundedJson } from "@/lib/http/read-bounded-json";
import { sourceMediaCandidates } from "@/lib/theme-studio/source-media";
import { saveThemePackageCandidates, publicMediaLink } from "@/lib/theme-studio/direct-link";

const schema = z.object({ sourceUrl: z.string().max(2048).refine(value => Boolean(publicMediaLink(value))), rightsCategory: z.enum(["owned", "public_domain", "cc_by", "cc_by_sa", "commercial_license"]), media: z.array(z.object({ url: z.string().max(4096).refine(value => Boolean(publicMediaLink(value))), kind: z.enum(["image", "video"]) }).strict()).min(1).max(8) }).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let rateLimit;
  try {
    const auth = await authenticateApiRequest(request); rateLimit = auth.rateLimit; requireScope(auth.scopes, "write");
    const body = await readBoundedJson(request, 64 * 1024);
    if (!body.ok) return withRateLimitHeaders(NextResponse.json({ error: "Use a JSON body under 64 KiB." }, { status: body.reason === "too_large" ? 413 : 400 }), rateLimit);
    const parsed = schema.safeParse(body.value);
    if (!parsed.success) return withRateLimitHeaders(NextResponse.json({ error: "Use a public source URL, media URLs and their declared reuse rights." }, { status: 400 }), rateLimit);
    const candidates = sourceMediaCandidates({ mediaCandidates: parsed.data.media }, parsed.data.sourceUrl, parsed.data.rightsCategory);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) return withRateLimitHeaders(NextResponse.json({ error: "Invalid package ID." }, { status: 400 }), rateLimit);
    try { await saveThemePackageCandidates(auth.tenantId, id, candidates); }
    catch (error) { return withRateLimitHeaders(NextResponse.json({ error: error instanceof Error ? error.message : "Package could not be edited." }, { status: 409 }), rateLimit); }
    return withRateLimitHeaders(NextResponse.json({ candidates, imported: false, next: "Choose the source media in Render media to register it as a workspace asset." }), rateLimit);
  } catch (error) { return apiErrorResponse(error, rateLimit); }
}
