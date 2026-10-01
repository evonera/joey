import { and, eq } from "drizzle-orm";
import { getActiveTenantMembership } from "@/lib/auth";
import { db } from "@/lib/db";
import { socialAccounts, themePages, scouts } from "@/lib/db/schema";
import { listAgencyAgents } from "@/lib/agency/service";
import { AgencyWorkspace } from "@/components/agency/agency-workspace";

export default async function AgentsPage() {
  const actor = await getActiveTenantMembership();
  const [agents, accounts, pages, sources] = await Promise.all([
    listAgencyAgents(actor),
    db.query.socialAccounts.findMany({
      where: and(eq(socialAccounts.tenantId, actor.tenantId), eq(socialAccounts.isActive, true)),
      columns: { id: true, platform: true, accountName: true },
      limit: 100,
    }),
    db.query.themePages.findMany({
      where: eq(themePages.tenantId, actor.tenantId),
      columns: { id: true, name: true },
      limit: 100,
    }),
    db.query.scouts.findMany({
      where: and(eq(scouts.tenantId, actor.tenantId), eq(scouts.platform, "instagram"), eq(scouts.isActive, false)),
      columns: { id: true, name: true },
      limit: 100,
    }),
  ]);
  return <AgencyWorkspace agents={agents} choices={{ accounts, pages, scouts: sources }} actor={actor} />;
}
