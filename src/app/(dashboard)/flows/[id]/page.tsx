import { notFound } from "next/navigation";
import { getFlow } from "@/app/actions/flows";
import { FlowBuilder } from "@/components/flows/flow-builder";

export const metadata = { title: "Flow Builder — Joey" };

export default async function FlowBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { flow } = await getFlow(id);
  if (!flow) notFound();

  return (
    <FlowBuilder
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
