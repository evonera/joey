import { auth, getActiveTenantMembership } from "@/lib/auth";
import { headers } from "next/headers";
import { liveblocks, isLiveblocksConfigured } from "@/lib/liveblocks";

export async function GET() {
  return Response.json({
    isConfigured: isLiveblocksConfigured(),
  });
}

export async function POST(request: Request) {
  if (!liveblocks) {
    return new Response(
      JSON.stringify({ error: "Liveblocks is not configured in this environment" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    const { tenantId, role } = await getActiveTenantMembership();

    // Prepare session for Liveblocks Access Token scoped to active workspace
    const liveSession = liveblocks.prepareSession(session.user.id, {
      organizationId: tenantId,
      userInfo: {
        name: session.user.name || "Anonymous",
        avatar: session.user.image || "",
        role,
        email: session.user.email,
      },
    });

    // Authorize room wildcards scoped strictly to this workspace
    liveSession.allow(`workspace:${tenantId}:*`, liveSession.FULL_ACCESS);

    const { status, body } = await liveSession.authorize();
    return new Response(body, {
      status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || "Failed to authorize Liveblocks session" }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
