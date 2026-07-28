import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { eq, and, like, sql } from "drizzle-orm";

export async function queryAssets(tenantId: string, opts?: {
  tags?: string[];
  search?: string;
  mimeType?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions = [eq(assets.tenantId, tenantId)];

  if (opts?.tags && opts.tags.length > 0) {
    conditions.push(sql`${assets.tags} && ${opts.tags}`);
  }

  if (opts?.search) {
    const escaped = opts.search.replace(/[%_]/g, "\\$&");
    conditions.push(like(assets.filename, `%${escaped}%`));
  }

  if (opts?.mimeType) {
    if (opts.mimeType.endsWith("/*")) {
      const prefix = opts.mimeType.slice(0, -2);
      conditions.push(like(assets.mimeType, `${prefix}%`));
    } else {
      conditions.push(eq(assets.mimeType, opts.mimeType));
    }
  }

  const rows = await db.query.assets.findMany({
    where: and(...conditions),
    orderBy: (assets, { desc }) => [desc(assets.createdAt)],
    limit: opts?.limit ?? 50,
    offset: opts?.offset ?? 0,
  });

  return rows;
}
