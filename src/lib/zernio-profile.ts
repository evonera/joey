import { and, eq, sql } from "drizzle-orm";
import type Zernio from "@zernio/node";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";

/** A dedicated provider profile keeps account sync scoped to this workspace. */
export async function ensureZernioProfile(tenantId: string, zernio: Zernio) {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM ${tenants} WHERE id = ${tenantId} FOR UPDATE`);
    const tenant = await tx.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
    if (!tenant) throw new Error("Workspace not found");
    if (tenant.zernioProfileId) return tenant.zernioProfileId;
    const name = `Joey ${tenantId}`;
    const existing = await zernio.profiles.listProfiles({ query: { name } });
    if (existing.error) throw new Error("Could not load Zernio profiles");
    let profileId = existing.data?.profiles?.find((profile: { name?: string; _id?: string }) => profile.name === name)?._id;
    if (!profileId) {
      const response = await zernio.profiles.createProfile({ body: { name, description: tenant.name }, headers: { "Idempotency-Key": `joey-workspace:${tenantId}` } });
      if (response.error || !response.data?.profile?._id) throw new Error("Zernio could not create a workspace profile. Check your Zernio plan's profile limit.");
      profileId = response.data.profile._id;
    }
    await tx.update(tenants).set({ zernioProfileId: profileId }).where(eq(tenants.id, tenantId));
    return profileId as string;
  });
}
