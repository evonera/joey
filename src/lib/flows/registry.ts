import type { NodeDefinition } from "./node-contract";
import { manualTriggerNode } from "./nodes/triggers/manual";
import { scheduleTriggerNode } from "./nodes/triggers/schedule";
import { filterNode } from "./nodes/transform/filter";
import { sortTopNNode } from "./nodes/transform/sort-top-n";
import { dedupeNode } from "./nodes/transform/dedupe";
import { conditionNode } from "./nodes/logic/condition";
import { llmTaskNode } from "./nodes/ai/llm-task";
import { createDraftNode } from "./nodes/actions/create-draft";
import { notifyNode } from "./nodes/actions/notify";

// P1 + P2 node catalog
import { webhookTriggerNode } from "./nodes/triggers/webhook";
import { apifyActorNode } from "./nodes/data/apify-actor";
import { exaSearchNode } from "./nodes/data/exa-search";
import { tavilySearchNode } from "./nodes/data/tavily-search";
import { transcribeNode } from "./nodes/ai/transcribe";
import { loopNode } from "./nodes/logic/loop";
import { approvalGateNode } from "./nodes/logic/approval-gate";

const definitions = {
  "trigger.manual": manualTriggerNode,
  "trigger.schedule": scheduleTriggerNode,
  "trigger.webhook": webhookTriggerNode,
  "transform.filter": filterNode,
  "transform.sort": sortTopNNode,
  "transform.dedupe": dedupeNode,
  "logic.condition": conditionNode,
  "logic.loop": loopNode,
  "logic.approval": approvalGateNode,
  "ai.llm": llmTaskNode,
  "ai.transcribe": transcribeNode,
  "action.create_draft": createDraftNode,
  "action.notify": notifyNode,
  "data.apify_actor": apifyActorNode,
  "data.exa_search": exaSearchNode,
  "data.tavily_search": tavilySearchNode,
} satisfies Record<string, NodeDefinition>;

// Compile-time drift guard: every key must equal the node's declared type.
type AssertKeysMatch = keyof typeof definitions extends never
  ? never
  : {
      [K in keyof typeof definitions & string]: (typeof definitions)[K]["type"] extends K
        ? true
        : never;
    };
const _keysMatch: AssertKeysMatch = {
  "trigger.manual": true,
  "trigger.schedule": true,
  "trigger.webhook": true,
  "transform.filter": true,
  "transform.sort": true,
  "transform.dedupe": true,
  "logic.condition": true,
  "logic.loop": true,
  "logic.approval": true,
  "ai.llm": true,
  "ai.transcribe": true,
  "action.create_draft": true,
  "action.notify": true,
  "data.apify_actor": true,
  "data.exa_search": true,
  "data.tavily_search": true,
};
void _keysMatch;

export type FlowNodeType = keyof typeof definitions;

export const nodeRegistry: Record<FlowNodeType, NodeDefinition> = definitions;

export function getNode(type: string): NodeDefinition | undefined {
  return (nodeRegistry as Record<string, NodeDefinition>)[type];
}

export type CatalogEntry = {
  type: FlowNodeType;
  category: NodeDefinition["category"];
  label: string;
  description: string;
  inputs: string[];
  outputs: string[];
};

/** Palette data for the builder UI. */
export function catalog(): CatalogEntry[] {
  return Object.values(nodeRegistry).map((n) => ({
    type: n.type as FlowNodeType,
    category: n.category,
    label: n.label,
    description: n.description,
    inputs: n.inputs,
    outputs: n.outputs,
  }));
}
