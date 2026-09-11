import { notFound } from "next/navigation";
import { getConnectedAccounts } from "@/app/actions/zernio";
import { getFlow } from "@/app/actions/flows";
import { FlowBuilder } from "@/components/flows/flow-builder";

export const metadata = { title: "Flow Builder — Joey" };

export default async function FlowBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [{ flow }, accountResult] = await Promise.all([getFlow(id), getConnectedAccounts()]);
  if (accountResult.error) throw new Error(accountResult.error);
  if (!flow) notFound();

  return (
    <FlowBuilder
      accounts={(accountResult.accounts ?? []).map(account => ({ id: account.id, name: account.accountName, platform: account.platform }))}
      flow={{
        id: flow.id,
        name: flow.name,
        description: flow.description,
        graph: flow.graph,
        status: flow.status,
        lastRunAt: flow.lastRunAt,
        webhookConfigured: flow.webhookConfigured,
      }}
    />
  );
}
