import { defineNode } from "../../node-contract";
import { llmTaskConfig } from "../../catalog";
import { runLlm } from "@/lib/llm";

const configSchema = llmTaskConfig;

export const llmTaskNode = defineNode({
  type: "ai.llm",
  category: "ai",
  label: "AI Task",
  description:
    "Runs an LLM over the incoming data. Optionally forces structured JSON via a schema. Spend counts against your LLM budget.",
  inputs: ["data"],
  outputs: ["result"],
  configSchema,
  async execute(input, rawConfig, ctx) {
    const config = configSchema.parse(rawConfig);

    const { assertBudget } = await import("@/lib/usage");
    const budget = await assertBudget(ctx.tenantId);
    if (!budget.allowed) {
      throw new Error(
        `Monthly LLM budget reached ($${budget.costUsd.toFixed(2)} / $${budget.budgetUsd}). ` +
          "Raise the limit in Settings to keep flows running.",
      );
    }

    let jsonSchema: Record<string, unknown> | undefined;
    if (config.outputSchema?.trim()) {
      jsonSchema = JSON.parse(config.outputSchema);
    }

    const userContent = config.userTemplate?.includes("{{input}}")
      ? config.userTemplate.replaceAll("{{input}}", safeStringify(input))
      : `${config.userTemplate ?? ""}\n\nINPUT:\n${safeStringify(input)}`.trim();

    const result = await runLlm({
      tenantId: ctx.tenantId,
      provider: config.provider,
      model: config.model,
      messages: [
        { role: "system", content: config.systemPrompt },
        { role: "user", content: userContent },
      ],
      jsonSchema,
      maxTokens: config.maxTokens,
    });

    // A configured schema is a contract: never fall back to raw text.
    if (jsonSchema && (result.json === undefined || result.json === null)) {
      throw new Error(
        "LLM output did not match the configured JSON schema (unparseable response). " +
          "Re-run the node or adjust the prompt/schema.",
      );
    }

    return {
      output: jsonSchema ? result.json : result.text,
    };
  },
});

function safeStringify(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
