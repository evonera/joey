import type { FlowGraphDoc } from "./types";
import type { ValidationIssue } from "./validation";

type KeyState = { provider: string; status: string };
type AccountState = { id: string; platform: string };

export type ActivationResources = {
  keys: KeyState[];
  accounts: AccountState[];
  env: Record<string, boolean>;
};

/** Check dependencies that graph validation cannot see. Never expose key values. */
export function checkActivationReadiness(
  graph: FlowGraphDoc,
  resources: ActivationResources,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const keyState = new Map(resources.keys.map((key) => [key.provider, key.status]));
  const hasKey = (provider: string) => keyState.get(provider) === "active" ||
    (!keyState.has(provider) && Boolean(resources.env[provider]));
  const requireKey = (nodeId: string, provider: string, label: string) => {
    if (!hasKey(provider)) {
      issues.push({ nodeId, severity: "error", message: `${label} needs a ${provider} key. Add it in Settings → API Keys before activating.` });
    }
  };

  for (const node of graph.nodes) {
    const config = node.config ?? {};
    switch (node.type) {
      case "data.exa_search":
        requireKey(node.id, "exa", "Web Research (Exa)");
        break;
      case "data.tavily_search":
        requireKey(node.id, "tavily", "Web Research (Tavily)");
        break;
      case "data.apify_actor":
        requireKey(node.id, "apify", "Apify Actor");
        break;
      case "ai.image":
      case "ai.transcribe":
        requireKey(node.id, "openai", node.type === "ai.image" ? "Image Generation" : "Transcription");
        break;
      case "ai.youtube_transcript":
        requireKey(node.id, "supadata", "YouTube Transcript");
        break;
      case "ai.decision":
        if (!hasKey("typesafe")) {
          issues.push({ nodeId: node.id, severity: "error", message: "AI Decision needs a TypeSafe key before activating. Ask an admin to configure TYPESAFE_API_KEY." });
        }
        break;
      case "ai.llm": {
        const requested = typeof config.provider === "string" ? config.provider : "openai";
        const candidates = requested === "openrouter"
          ? ["openrouter"]
          : [requested, ...["google", "anthropic", "openai"].filter((provider) => provider !== requested)];
        if (!candidates.some(hasKey)) {
          issues.push({ nodeId: node.id, severity: "error", message: "AI step needs a model provider key. Add one in Settings → API Keys before activating." });
        }
        break;
      }
      case "action.create_draft": {
        // A draft can be reviewed before any social account is connected. Only
        // an explicitly selected destination must still be available.
        const accountId = typeof config.accountId === "string" ? config.accountId : "";
        if (!accountId) break;
        const platform = config.platform === "twitter" ? "x" : config.platform;
        if (!resources.accounts.some((account) => account.id === accountId &&
          (account.platform === platform || (platform === "x" && account.platform === "twitter")))) {
          issues.push({ nodeId: node.id, severity: "error", message: "The selected draft account is disconnected. Choose an active account before activating." });
        }
        break;
      }
    }
  }
  return issues;
}
