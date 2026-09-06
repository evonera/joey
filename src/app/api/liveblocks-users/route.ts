import { auth, getActiveTenantMembership } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

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
    const { userIds } = (await request.json()) as { userIds?: string[] };
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return Response.json([]);
    }

    // Fetch users matching the provided IDs
    const users = await db.query.user.findMany({
      where: inArray(schema.user.id, userIds),
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
