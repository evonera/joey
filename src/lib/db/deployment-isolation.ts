type Environment = Readonly<Record<string, string | undefined>>;

function normalizedHost(value: string) {
  return value.toLowerCase().replace(/-pooler(?=\.)/, "");
}

/** Deployment configuration must fail closed before opening a database pool. */
export function assertDeploymentDatabaseIsolation(env: Environment) {
  if (env.VERCEL_ENV !== "preview" && env.VERCEL_ENV !== "production") return;
  const production = env.JOEY_PRODUCTION_DATABASE_HOST;
  const preview = env.JOEY_PREVIEW_DATABASE_HOST;
  const expected = env.VERCEL_ENV === "production" ? production : preview;
  if (!production || !expected) throw new Error("Configure the deployment's isolated database host before starting Joey.");
  if (env.VERCEL_ENV === "preview" && normalizedHost(preview!) === normalizedHost(production)) {
    throw new Error("Preview must use a separate database from production.");
  }
  let actual: string;
  try { actual = new URL(env.DATABASE_URL || "").hostname; }
  catch { throw new Error("Configure a valid deployment database URL."); }
  if (normalizedHost(actual) !== normalizedHost(expected)) {
    throw new Error("Database host does not match this deployment environment; refusing to connect.");
  }
}
