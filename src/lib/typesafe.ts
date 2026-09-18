import { TypeSafeClient, choice, type ChoiceCriteria } from "@typesafe-ai/sdk";

export interface DmRuleCandidate {
  id: string;
  triggerValue: string;
  triggerType?: string;
  responseTemplate?: string;
  responseLink?: string | null;
  stats?: unknown;
}

/**
 * Resolves the TypeSafe API key for a tenant (BYOK from api_keys first, then process.env).
 */
export async function resolveTypesafeApiKey(tenantId?: string | null): Promise<string | null> {
  if (tenantId) {
    try {
      const { db } = await import("@/lib/db");
      const { apiKeys } = await import("@/lib/db/schema");
      const { and, eq } = await import("drizzle-orm");
      const { decrypt } = await import("@/lib/crypto");

      const keyRow = await db.query.apiKeys.findFirst({
        where: and(
          eq(apiKeys.tenantId, tenantId),
          eq(apiKeys.provider, "typesafe"),
          eq(apiKeys.status, "active"),
        ),
      });

      if (keyRow?.encryptedKey) {
        return decrypt(keyRow.encryptedKey, tenantId);
      }
    } catch (err) {
      console.warn("[typesafe] Failed to read tenant BYOK key:", err);
    }
  }

  return process.env.TYPESAFE_API_KEY || null;
}

/**
 * Returns an authenticated TypeSafeClient instance with a default 2500ms timeout for webhooks.
 */
export async function getTypesafeClient(tenantId?: string | null): Promise<TypeSafeClient | null> {
  const apiKey = await resolveTypesafeApiKey(tenantId);
  if (!apiKey) return null;

  return new TypeSafeClient({
    apiKey,
    timeout: 2500,
  });
}

/**
 * Evaluates an incoming comment against active DM automation rules using TypeSafe's Jev System One model.
 * Returns the matching rule if confidence is high (>= 0.85), or null if no rule matches or on error.
 */
export async function matchCommentRuleSemantically<T extends DmRuleCandidate>(
  commentText: string,
  rules: T[],
  tenantId?: string | null,
  options?: {
    confidenceThreshold?: number;
    client?: TypeSafeClient;
  },
): Promise<T | null> {
  if (!commentText || !commentText.trim() || rules.length === 0) {
    return null;
  }

  const client = options?.client ?? (await getTypesafeClient(tenantId));
  if (!client) {
    return null;
  }

  const threshold = options?.confidenceThreshold ?? 0.85;

  const criteria: ChoiceCriteria = {};
  for (const rule of rules) {
    const concept = rule.triggerValue.toLowerCase();
    criteria[`rule_${rule.id}`] =
      `The commenter is specifically requesting or showing interest in "${concept}" (e.g. asking for details, links, guide, steps, or resources about "${concept}")`;
  }
  criteria["none"] =
    "The commenter is not requesting any of these specific resources (general reaction, compliments, emoji, casual remark, praise, or unrelated question)";

  try {
    const response = await client.systemOne({
      state: {
        comment: commentText.trim(),
      },
      questions: {
        intent: choice(
          "Which resource, action, or offer is the commenter requesting from the author, if any?",
          criteria,
        ),
      },
    });

    const answer = response.answers.intent;
    if (!answer || answer.choice === "none") {
      return null;
    }

    if (answer.confidence < threshold) {
      return null;
    }

    const selectedProbability = answer.probabilities[answer.choice] ?? 0;
    if (selectedProbability < 0.75) {
      return null;
    }

    const matchedRuleId = answer.choice.replace(/^rule_/, "");
    return rules.find((r) => r.id === matchedRuleId) ?? null;
  } catch (error) {
    console.warn("[typesafe] Semantic DM match failed gracefully:", error);
    return null;
  }
}
