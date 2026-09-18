import { defineNode } from "../../node-contract";
import { aiDecisionConfig } from "../../catalog";
import { getTypesafeClient } from "@/lib/typesafe";
import { choice, type ChoiceCriteria, type EntryType } from "@typesafe-ai/sdk";
import { getField } from "../transform/filter";

const configSchema = aiDecisionConfig;

/**
 * Extracts decision choices from node config.
 * Supports programmatic `choices` record or form-provided `choicesJson` string.
 * Strictly throws if provided choices are invalid or contain fewer than 2 valid criteria.
 * Defaults to binary yes/no only when neither choices nor choicesJson is configured.
 */
export function parseDecisionChoices(raw: Record<string, unknown>): Record<string, string> {
  if (raw.choices !== undefined) {
    if (!raw.choices || typeof raw.choices !== "object" || Array.isArray(raw.choices)) {
      throw new Error("Invalid choices: must be an object mapping branch keys to descriptions.");
    }
    const res: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.choices)) {
      if (typeof v === "string" && v.trim()) {
        res[k.trim()] = v.trim();
      }
    }
    if (Object.keys(res).length < 2) {
      throw new Error(`Invalid decision choices: at least 2 choices are required, but found ${Object.keys(res).length}.`);
    }
    return res;
  }

  if (typeof raw.choicesJson === "string" && raw.choicesJson.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.choicesJson);
    } catch (err: any) {
      throw new Error(`Invalid JSON syntax in choicesJson: ${err?.message || String(err)}`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid choicesJson: must be a JSON object mapping branch keys to descriptions.");
    }
    const res: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) {
        res[k.trim()] = v.trim();
      }
    }
    if (Object.keys(res).length < 2) {
      throw new Error(`Invalid decision choices: at least 2 choices are required in choicesJson, but found ${Object.keys(res).length}.`);
    }
    return res;
  }

  return {
    yes: "The condition or criteria is met",
    no: "The condition or criteria is not met",
  };
}

/**
 * Normalizes input data into structured state for TypeSafe Jev System One evaluation.
 */
function buildJevState(targetData: unknown): EntryType {
  if (targetData === null || targetData === undefined) {
    return "";
  }
  if (typeof targetData === "string") {
    return targetData.trim();
  }
  if (typeof targetData === "object" && !Array.isArray(targetData)) {
    return targetData as Record<string, any>;
  }
  return JSON.stringify(targetData);
}

/**
 * Wraps outgoing data so downstream flow nodes receive both original attributes and decision metadata.
 */
export function wrapDecisionOutput(
  input: unknown,
  choice: string,
  confidence: number,
  probabilities: Record<string, number>,
  rawChoice?: string,
): unknown {
  const decisionMeta = {
    choice,
    rawChoice: rawChoice ?? choice,
    confidence,
    probabilities,
  };

  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return {
      ...(input as Record<string, unknown>),
      __decision: decisionMeta,
      choice,
      confidence,
    };
  }

  return {
    ...decisionMeta,
    data: input,
  };
}

export const aiDecisionNode = defineNode({
  type: "ai.decision",
  category: "ai",
  label: "AI Decision",
  description:
    "Fast (~120ms), cost-effective semantic decision and classification via TypeSafe Jev. Branches the flow dynamically based on calibrated choice.",
  inputs: ["data"],
  outputs: ["yes", "no", "fallback"],
  configSchema,
  async execute(input, rawConfig, ctx) {
    const config = configSchema.parse(rawConfig);
    const criteria = parseDecisionChoices(config as unknown as Record<string, unknown>);

    const defaultChoice = config.defaultChoice?.trim() || "fallback";
    const threshold = config.confidenceThreshold ?? 0.7;

    // Resolve target data for evaluation
    const targetData = config.inputField ? getField(input, config.inputField) : input;
    const state = buildJevState(targetData);

    const client = await getTypesafeClient(ctx.tenantId, { timeout: config.timeoutMs });
    if (!client) {
      if (config.fallbackOnError) {
        console.warn(
          `[ai.decision] No TypeSafe API key available for tenant ${ctx.tenantId}. Routing to fallback branch "${defaultChoice}".`,
        );
        return {
          output: wrapDecisionOutput(input, defaultChoice, 0, {}),
          branch: defaultChoice,
        };
      }
      throw new Error(
        "No TypeSafe API key configured. Add a TypeSafe API key in Settings → API Keys or set TYPESAFE_API_KEY.",
      );
    }

    try {
      const response = await client.systemOne(
        {
          state,
          questions: {
            decision: choice(config.question, criteria as ChoiceCriteria),
          },
        },
        {
          signal: ctx.signal,
          timeout: config.timeoutMs,
        },
      );

      const answer = response.answers.decision;
      if (!answer) {
        throw new Error("TypeSafe Jev did not return an answer for the decision question.");
      }

      const selected = answer.choice;
      const confidence = typeof answer.confidence === "number" ? answer.confidence : 0;
      const probabilities = (answer.probabilities as Record<string, number>) || {};

      // If confidence falls below the calibrated threshold, route to defaultChoice
      const finalBranch = confidence >= threshold ? selected : defaultChoice;

      return {
        output: wrapDecisionOutput(input, finalBranch, confidence, probabilities, selected),
        branch: finalBranch,
      };
    } catch (err) {
      if (config.fallbackOnError) {
        console.warn(
          `[ai.decision] Jev decision evaluation failed. Routing to fallback branch "${defaultChoice}":`,
          err,
        );
        return {
          output: wrapDecisionOutput(input, defaultChoice, 0, {}),
          branch: defaultChoice,
        };
      }
      throw err;
    }
  },
});
