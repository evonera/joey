import { ForbiddenError, UnauthenticatedError } from "eve/channels/auth";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { eveSessionOwners } from "@/lib/db/schema";
import { assertAgentSessionAccess, type AgencyActor } from "@/lib/agency/config";
import { getAgencyProfile } from "@/lib/agency/service";
import { checkRateLimit } from "@/lib/rate-limit";

export async function authorizeAgencyRoute(request: Request, actor: AgencyActor | null) {
  const match = new URL(request.url).pathname.match(/\/eve\/v1\/session\/([^/]+)(?:\/|$)/);
  const sessionId = match ? decodeURIComponent(match[1]) : undefined;
  const requestedAgent = request.headers.get("x-joey-agent");
  let thread = sessionId ? await db.query.eveSessionOwners.findFirst({ where: eq(eveSessionOwners.sessionId, sessionId) }) : undefined;
  if (actor && sessionId && !thread) {
    const limit = await checkRateLimit(`eve-ownership:${actor.tenantId}:${actor.userId}`, 12);
    if (!limit.allowed) throw new ForbiddenError({ message: "Too many unknown conversation requests. Try again later." });
    // Create returns 202 before the Workflow starts. Wait briefly for the
    // server hook, never accepting a client-supplied claim of ownership.
    for (const delay of [100, 200, 400, 800, 1600, 2400]) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { request.signal.removeEventListener("abort", abort); resolve(); }, delay);
        const abort = () => { clearTimeout(timer); request.signal.removeEventListener("abort", abort); reject(request.signal.reason); };
        if (request.signal.aborted) abort();
        else request.signal.addEventListener("abort", abort, { once: true });
      });
      thread = await db.query.eveSessionOwners.findFirst({ where: eq(eveSessionOwners.sessionId, sessionId) });
      if (thread) break;
    }
    if (!thread) throw new ForbiddenError({ message: "Conversation ownership is unavailable. Cached history is still readable; start a new conversation." });
  }
  if (!requestedAgent && !thread) return null;
  // Throw instead of returning null: an agency denial must not fall through
  // to the infrastructure or permissive localhost authenticators.
  if (!actor) throw new UnauthenticatedError({ message: "Sign in to access an agent conversation." });
  try {
    if (thread && (thread.tenantId !== actor.tenantId || thread.userId !== actor.userId)) throw new Error("Conversation not found.");
    if (thread && !thread.agentId && !requestedAgent) return null;
    if (thread && requestedAgent !== null && thread.agentId !== requestedAgent) throw new Error("Conversation not found.");
    const id = requestedAgent || thread!.agentId;
    if (!id) throw new Error("Conversation not found.");
    const profile = await getAgencyProfile(actor, id, Boolean(thread));
    if (!sessionId && profile.state === "archived") throw new Error("Agent not found.");
    if (sessionId) {
      if (!thread) throw new Error("Conversation not found.");
      const control = new URL(request.url).pathname.endsWith("/cancel");
      assertAgentSessionAccess({ actor, agentId: id, agentVersion: profile.configVersion, agentState: profile.state, thread: { ...thread, agentId: thread.agentId!, configVersion: thread.configVersion! }, write: request.method !== "GET" && !control });
    }
    return { ...profile, sessionVersion: thread?.configVersion ?? profile.configVersion };
  } catch (error) {
    throw new ForbiddenError({ message: error instanceof Error ? error.message : "Conversation not found." });
  }
}
