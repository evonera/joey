import { NextResponse } from 'next/server';
import { authenticateApiRequest, requireScope, withRateLimitHeaders } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { drafts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function POST(request: Request) {
    try {
        const { tenantId, scopes, rateLimit } = await authenticateApiRequest(request);
        requireScope(scopes, "approve");
        const body = await request.json();
        const { id: draftId, variantName, content } = body;

        if (!draftId) {
            return withRateLimitHeaders(
                NextResponse.json({ error: "Missing draft id" }, { status: 400 }),
                rateLimit
            );
        }

        const updateData: Partial<typeof drafts.$inferInsert> & { status: string; errorMessage: null } = { status: "approved", errorMessage: null };
        if (variantName && content) {
            updateData.selectedVariantId = variantName;
            updateData.content = content;
        }

        // Existence + tenant check ALWAYS runs so a bad id or foreign draft
        // can never report success.
        const existing = await db.query.drafts.findFirst({
            where: and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)),
            columns: { content: true, variants: true }
        });
        if (!existing) {
            return withRateLimitHeaders(
                NextResponse.json({ error: "Draft not found" }, { status: 404 }),
                rateLimit
            );
        }
        if (!variantName && !existing.content) {
            let autoVariantName: string | undefined;
            let autoContent: string | undefined;

            if (Array.isArray(existing.variants) && existing.variants.length > 0) {
                const first = existing.variants[0] as any;
                autoVariantName = first.variantName || first.name || "default";
                autoContent = first.content || first.text || "";
            } else if (existing.variants && typeof existing.variants === "object") {
                const keys = Object.keys(existing.variants);
                if (keys.length > 0) {
                    autoVariantName = keys[0];
                    const val = (existing.variants as any)[keys[0]];
                    autoContent = typeof val === "string" ? val : (val?.content || val?.text || "");
                }
            }

            if (autoVariantName && autoContent) {
                updateData.selectedVariantId = autoVariantName;
                updateData.content = autoContent;
            } else {
                return withRateLimitHeaders(
                    NextResponse.json({ error: "Cannot approve a draft without content. Please select a variant." }, { status: 400 }),
                    rateLimit
                );
            }
        }

        const updated = await db.update(drafts)
            .set(updateData)
            .where(and(eq(drafts.id, draftId), eq(drafts.tenantId, tenantId)))
            .returning();

        if (updated.length === 0) {
            return withRateLimitHeaders(
                NextResponse.json({ error: "Draft not found" }, { status: 404 }),
                rateLimit
            );
        }

        return withRateLimitHeaders(NextResponse.json({ success: true }), rateLimit);
    } catch (error: any) {
        if (error.name === 'RateLimitError') {
            return NextResponse.json({ error: error.message }, { status: 429 });
        }
        if (error.message.startsWith('Insufficient scope')) {
            return NextResponse.json({ error: error.message }, { status: 403 });
        }
        return NextResponse.json({ error: error.message }, { status: 401 });
    }
}
