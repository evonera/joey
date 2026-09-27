export function getConfiguredSocialProviders(
  env: { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string } = {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  },
): string[] {
  return env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? ["google"] : [];
}
