import { eveChannel } from "eve/channels/eve";
import { localDev, type AuthFn, vercelOidc } from "eve/channels/auth";
import { auth, getActiveTenantIdFromSession } from "@/lib/auth";
import { authorizeAgencyRoute } from "../lib/agency-route-auth";

function joeySession(): AuthFn<Request> {
  return async (request) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      await authorizeAgencyRoute(request, null);
      return null;
    }
    const tenantId = await getActiveTenantIdFromSession(session);
    const preferredModel = request.headers.get("x-joey-model");
    const profile = await authorizeAgencyRoute(request, { tenantId, userId: session.user.id });
    const attributes: Record<string, string> = {
      email: session.user.email,
      tenantId,
      userId: session.user.id,
    };
    if (profile) {
      attributes.customAgentId = profile.id;
      attributes.customAgentVersion = String(profile.sessionVersion);
    }
    if (preferredModel) {
      attributes.preferredModel = preferredModel;
    }
    return {
      authenticator: "better-auth",
      principalId: JSON.stringify([session.user.id, tenantId]),
      principalType: "user",
      attributes,
    };
  };
}

export default eveChannel({
  auth: [
    joeySession(),
    // Lets the eve TUI and your Vercel deployments reach the deployed agent.
    vercelOidc(),
    // Open on localhost for `eve dev` and the REPL; ignored in production.
    localDev(),
  ],
});
