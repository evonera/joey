type AuthUrlEnvironment = Readonly<Record<string, string | undefined>>;

function configuredOrigin(value: string, name: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${name} must be an absolute HTTP(S) origin.`); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name} must be an HTTP(S) origin without credentials, a path, query or fragment.`);
  }
  return url.origin;
}

/** Resolve only configured deployment origins; never send self-hosted auth to Joey Cloud. */
export function resolveAuthBaseURL(env: AuthUrlEnvironment, isBuildPhase = false): string {
  const authURL = env.BETTER_AUTH_URL?.trim();
  const publicURL = env.NEXT_PUBLIC_APP_URL?.trim();
  const authOrigin = authURL ? configuredOrigin(authURL, 'BETTER_AUTH_URL') : undefined;
  const publicOrigin = publicURL ? configuredOrigin(publicURL, 'NEXT_PUBLIC_APP_URL') : undefined;
  if (authOrigin && publicOrigin && authOrigin !== publicOrigin) {
    throw new Error('BETTER_AUTH_URL and NEXT_PUBLIC_APP_URL must use the same origin. Rebuild after changing NEXT_PUBLIC_APP_URL.');
  }
  const deploymentURL = env.VERCEL_URL ? `https://${env.VERCEL_URL}`
    : env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
    : env.DEPLOY_PRIME_URL || env.URL;
  const configured = authOrigin || publicOrigin ||
    (deploymentURL ? configuredOrigin(deploymentURL, 'Deployment URL') : undefined);
  if (configured) return configured;
  if (env.NODE_ENV === 'production' && !isBuildPhase) {
    throw new Error('Set BETTER_AUTH_URL and NEXT_PUBLIC_APP_URL to this deployment’s public origin before starting production.');
  }
  // Build discovery imports auth without a running deployment. This value is
  // never a production fallback; runtime still requires a configured origin.
  return 'http://localhost:3000';
}
