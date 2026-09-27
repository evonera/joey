import { auth, getActiveTenantMembership } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
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
    const text = url.searchParams.get("text") || "";

    const memberships = await db.query.member.findMany({
      where: eq(schema.member.organizationId, tenantId),
      columns: {
        userId: true,
      },
      limit: 200,
    });

    const memberIds = memberships.map((m) => m.userId);
    if (memberIds.length === 0) {
      return Response.json({ userIds: [] });
    }

    const users = await db.query.user.findMany({
      where: inArray(schema.user.id, memberIds),
      columns: {
        id: true,
        name: true,
        email: true,
      },
    });

    let matched = users;
    if (text.trim().length > 0) {
      const q = text.toLowerCase();
      matched = users.filter(
        (u) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
      );
    }

    return Response.json({ userIds: matched.map((u) => u.id) });
  } catch {
    return Response.json({ userIds: [] });
  }
}
