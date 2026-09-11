import { Liveblocks } from "@liveblocks/node";

const secretKey = process.env.LIVEBLOCKS_SECRET_KEY?.trim();

/**
 * Server-side Liveblocks client instance.
 * Evaluates to `null` if LIVEBLOCKS_SECRET_KEY is not defined in the environment,
 * ensuring zero startup crashes in local dev or self-hosted setups.
 */
export const liveblocks = secretKey
  ? new Liveblocks({ secret: secretKey })
  : null;

/**
 * Returns true if Liveblocks is configured with a valid secret key.
 */
export function isLiveblocksConfigured(): boolean {
  const key = process.env.LIVEBLOCKS_SECRET_KEY?.trim();
  return Boolean(key && key.length > 0);
}
