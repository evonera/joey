import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { storyClusters } from "@/lib/db/schema";
import { themeRenderInput } from "./theme-adapter";
import { themePackageRenderRevision } from "./theme-revision";

/** Legacy cards draw captions and facts, so those must invalidate their pixels. */
export async function legacyThemeRenderInput(tenantId: string, packageId: string) {
  const input = await themeRenderInput(tenantId, packageId);
  const cluster = input.pkg.clusterId ? await db.query.storyClusters.findFirst({
    where: and(eq(storyClusters.id, input.pkg.clusterId), eq(storyClusters.tenantId, tenantId)),
  }) : undefined;
  const revision = themePackageRenderRevision({
    title: input.pkg.title, name: input.page.name, brand: input.brand, format: input.format.mediaType,
    component: { ...input.component, legacy: { renderer: "joey-static-2", caption: input.pkg.caption, facts: cluster?.facts ?? [], provenance: input.pkg.provenance, aspectRatio: input.format.aspectRatio } },
  });
  return { ...input, cluster, revision };
}
