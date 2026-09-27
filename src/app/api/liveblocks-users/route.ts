import { auth, getActiveTenantMembership } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, inArray, asc, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { readBoundedJson } from "@/lib/http/read-bounded-json";

const requestSchema = z.object({
  userIds: z.array(z.string().min(1).max(128)).max(100),
}).strict();

/**
 * Resolves user information for Liveblocks components (AvatarStack, Threads, Mentions).
 * Strictly scoped to the authenticated tenant.
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const parsed = await readBoundedJson<unknown>(request, 32 * 1024);
    if (!parsed.ok) return Response.json({ error: parsed.reason === "too_large" ? "Request body is too large" : "Invalid JSON body" }, { status: parsed.reason === "too_large" ? 413 : 400 });
    const body = requestSchema.safeParse(parsed.value);
    if (!body.success) return Response.json({ error: "Invalid user lookup request" }, { status: 400 });

    const membership = await getActiveTenantMembership().catch(() => null);
    const tenantId = membership?.tenantId;
    const { userIds } = body.data;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return Response.json([]);
    }

    if (!tenantId) {
      return Response.json(userIds.map(() => ({ name: "Teammate" })));
    }

    // Strictly verify which requested userIds are members of the caller's active tenant
    const memberships = await db.query.member.findMany({
      where: and(
        eq(schema.member.organizationId, tenantId),
        inArray(schema.member.userId, userIds)
      ),
      columns: {
        userId: true,
      },
      limit: 100,
    });

    const authorizedUserIds = new Set((memberships || []).map((m) => m.userId));
    if (authorizedUserIds.size === 0) {
      return Response.json(userIds.map(() => ({ name: "Teammate" })));
    }

    // Fetch users matching ONLY the authorized member IDs
    const users = await db.query.user.findMany({
      where: inArray(schema.user.id, Array.from(authorizedUserIds)),
      columns: {
        id: true,
        name: true,
        image: true,
      },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    // Must return an array in the exact same length and order as userIds
    const resolved = userIds.map((id) => {
      const u = userMap.get(id);
      if (!u) {
        return { name: "Teammate" };
      }
      return {
        name: u.name || "Teammate",
        avatar: u.image || undefined,
      };
    });

    return Response.json(resolved);
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || "Failed to resolve users" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

/**
 * Autocompletes mention suggestions in comment threads.
 * Returns member IDs of the active workspace matching the search query.
 */
export async function GET(request: Request) {
  try {
    const { tenantId } = await getActiveTenantMembership();
    const url = new URL(request.url);
    const text = (url.searchParams.get("text") || "").trim();
    if (text.length > 128) {
      return Response.json({ error: "Search text is too long" }, { status: 400 });
    }

    // Search inside the tenant-scoped join before applying the bounded result
    // limit, so large workspaces don't hide later matching members.
    const conditions = [eq(schema.member.organizationId, tenantId)];
    if (text) {
      const escaped = text.replace(/[\\%_]/g, "\\$&");
      const pattern = `%${escaped}%`;
      // Both columns are parameterized by Drizzle; escaping keeps user
      // wildcards from turning autocomplete into an unfiltered tenant scan.
      conditions.push(or(
        ilike(schema.user.name, pattern),
        ilike(schema.user.email, pattern),
      )!);
    }

    const matched = await db
      .select({ userId: schema.member.userId })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
      .where(and(...conditions))
      .orderBy(asc(schema.user.name), asc(schema.user.id))
      .limit(50);

    return Response.json({ userIds: matched.map(({ userId }) => userId) });
  } catch {
    return Response.json({ userIds: [] });
  }
}
