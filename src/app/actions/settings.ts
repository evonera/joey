"use server";

import { getAgentConfig } from "./agent";
import { getConnectedAccounts } from "./zernio";
import { getUsage } from "./usage";
import { getNotificationPreferences } from "./notifications";
import { getApiKey } from "./api-keys";

// Browser Server Action calls are queued by Next.js. Aggregate independent
// reads on the server to avoid eight sequential client/server round trips.
export async function getSettingsData() {
  const [configRes, accountsRes, usageRes, prefsRes, keys] = await Promise.all([
    getAgentConfig(), getConnectedAccounts(), getUsage(), getNotificationPreferences(),
    Promise.all(["openai", "anthropic", "google", "fal"].map(getApiKey)),
  ]);
  return { configRes, accountsRes, usageRes, prefsRes, keys };
}
