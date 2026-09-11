import { NextRequest, NextResponse } from "next/server";
import Zernio from "@zernio/node";
import { auth, getActiveTenantMembership } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiKeys, tenants, socialAccounts } from "@/lib/db/schema";
import { encrypt, decrypt } from "@/lib/crypto";
import { eq, and, sql } from "drizzle-orm";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  if (!await auth.api.getSession({ headers: req.headers })) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let tenantId: string;
  try { ({ tenantId } = await getActiveTenantMembership(["owner", "admin"])); }
  catch { return NextResponse.json({ error: "Only workspace owners and admins can change the Zernio connection." }, { status: 403 }); }
  const body = await req.json().catch(() => null);
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  if (apiKey.length < 8 || apiKey.length > 4096 || /\s/.test(apiKey)) return NextResponse.json({ error: "Enter a complete Zernio API key." }, { status: 400 });
  try {
    if (!(await checkRateLimit(`zernio-key:${tenantId}`, 10)).allowed) return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
    const zernio = new Zernio({ apiKey });
    const result = await zernio.accounts.listAccounts();
    if (result.error || !Array.isArray(result.data?.accounts)) {
      return NextResponse.json({ error: "Zernio could not validate this key. Check the key and try again." }, { status: 400 });
    }
    const encryptedKey = encrypt(apiKey, tenantId);
    await db.transaction(async tx => {
      await tx.execute(sql`SELECT id FROM ${tenants} WHERE id = ${tenantId} FOR UPDATE`);
      const existing = await tx.query.apiKeys.findFirst({ where: and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.provider, "zernio")) });
      if (existing) {
        let changed = true;
        try { changed = decrypt(existing.encryptedKey, tenantId) !== apiKey; } catch { /* Unreadable keys need replacement. */ }
        if (changed) {
          await tx.update(tenants).set({ zernioProfileId: null }).where(eq(tenants.id, tenantId));
          await tx.update(socialAccounts).set({ isActive: false }).where(eq(socialAccounts.tenantId, tenantId));
        }
        await tx.update(apiKeys).set({ encryptedKey, status: "active" }).where(eq(apiKeys.id, existing.id));
      }
      else await tx.insert(apiKeys).values({ tenantId, provider: "zernio", encryptedKey, status: "active" });
    });
    return NextResponse.json({ success: true });
  } catch {
    // Never log a provider request object: it may contain the submitted API key.
    return NextResponse.json({ error: "The connection could not be verified. Please try again." }, { status: 502 });
  }
}
