import { notFound } from "next/navigation";
import { getConnectedAccounts } from "@/app/actions/zernio";
import { getFlow, validateFlowActivation } from "@/app/actions/flows";
import { FlowBuilder } from "@/components/flows/flow-builder";

export const metadata = { title: "Flow Builder — Joey" };

export default async function FlowBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [{ flow }, accountResult, readiness] = await Promise.all([getFlow(id), getConnectedAccounts(), validateFlowActivation(id)]);
  if (accountResult.error) throw new Error(accountResult.error);
  if (!flow) notFound();

  return (
    <FlowBuilder
      activationIssues={readiness.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message)}
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
