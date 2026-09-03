import { eveChannel } from "eve/channels/eve";
import { localDev, type AuthFn, vercelOidc } from "eve/channels/auth";
import { auth, getActiveTenantIdFromSession } from "@/lib/auth";

function joeySession(): AuthFn<Request> {
  return async (request) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return null;
    const tenantId = await getActiveTenantIdFromSession(session);
    const preferredModel = request.headers.get("x-joey-model");
    const attributes: Record<string, string> = {
      email: session.user.email,
      tenantId,
    };
    if (preferredModel) {
      attributes.preferredModel = preferredModel;
    }
    return {
      authenticator: "better-auth",
      principalId: session.user.id,
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
