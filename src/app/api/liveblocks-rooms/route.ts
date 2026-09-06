import { auth, getActiveTenantMembership } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { drafts, flows } from "@/lib/db/schema";
import { inArray, and, eq } from "drizzle-orm";

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
    const { tenantId } = await getActiveTenantMembership();
    const body = await request.json();
    const roomIds: string[] = body.roomIds || [];

    if (!Array.isArray(roomIds) || roomIds.length === 0) {
      return Response.json([]);
    }

    const draftIds: string[] = [];
    const flowIds: string[] = [];

    for (const roomId of roomIds) {
      if (typeof roomId !== "string") continue;
      if (roomId.includes(":draft:")) {
        const id = roomId.split(":draft:")[1];
        if (id) draftIds.push(id);
      } else if (roomId.includes(":flow:")) {
        const id = roomId.split(":flow:")[1];
        if (id) flowIds.push(id);
      }
    }

    const [foundDrafts, foundFlows] = await Promise.all([
      draftIds.length > 0
        ? db.query.drafts.findMany({
            where: and(eq(drafts.tenantId, tenantId), inArray(drafts.id, draftIds)),
          })
        : [],
      flowIds.length > 0
        ? db.query.flows.findMany({
            where: and(eq(flows.tenantId, tenantId), inArray(flows.id, flowIds)),
          })
        : [],
    ]);

    const draftMap = new Map(foundDrafts.map((d) => [d.id, d]));
    const flowMap = new Map(foundFlows.map((f) => [f.id, f]));

    // Must return an array of exactly the same length and order as roomIds
    const roomsInfo = roomIds.map((roomId) => {
      if (typeof roomId !== "string") {
        return { name: "Collaborative Session", url: "/dashboard" };
      }

      if (roomId.includes(":presence")) {
        return {
          name: "Workspace Team Presence",
          url: "/dashboard",
        };
      }

      if (roomId.includes(":draft:")) {
        const id = roomId.split(":draft:")[1];
        const draft = draftMap.get(id);
        const name = draft?.content
          ? draft.content.length > 40
            ? `${draft.content.slice(0, 40)}…`
            : draft.content
          : `Draft #${id.slice(0, 8)}`;
        return {
          name,
          url: "/drafts",
        };
      }

      if (roomId.includes(":flow:")) {
        const id = roomId.split(":flow:")[1];
        const flow = flowMap.get(id);
        return {
          name: flow?.name || `Flow #${id.slice(0, 8)}`,
          url: `/flows/${id}`,
        };
      }

      return {
        name: "Collaborative Session",
        url: "/dashboard",
      };
    });

    return Response.json(roomsInfo);
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || "Failed to resolve room info" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
