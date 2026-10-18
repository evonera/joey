import { describe, expect, it } from "vitest";
import { assertDeploymentDatabaseIsolation } from "../db/deployment-isolation";
const hosts = { JOEY_PRODUCTION_DATABASE_HOST: "ep-production-pooler.us-east-2.aws.neon.tech", JOEY_PREVIEW_DATABASE_HOST: "ep-preview.us-east-2.aws.neon.tech" };
const url = (host: string) => `postgres://user:secret@${host}/neondb`;
describe("deployment database isolation", () => {
  it("rejects a preview inheriting production credentials before opening a pool", () => {
    expect(() => assertDeploymentDatabaseIsolation({ ...hosts, VERCEL_ENV: "preview", DATABASE_URL: url(hosts.JOEY_PRODUCTION_DATABASE_HOST) })).toThrow("refusing to connect");
  });
  it("recognizes pooled and direct host aliases as the same database", () => {
    expect(() => assertDeploymentDatabaseIsolation({ ...hosts, VERCEL_ENV: "preview", JOEY_PREVIEW_DATABASE_HOST: hosts.JOEY_PRODUCTION_DATABASE_HOST.replace("-pooler", ""), DATABASE_URL: url(hosts.JOEY_PRODUCTION_DATABASE_HOST) })).toThrow("separate database");
  });
  it.each(["preview", "production"])("requires explicit database identity in %s", VERCEL_ENV => {
    expect(() => assertDeploymentDatabaseIsolation({ VERCEL_ENV, DATABASE_URL: url("ep-any.neon.tech") })).toThrow("isolated database host");
  });
  it("accepts isolated preview and matching production, including pooling aliases", () => {
    expect(() => assertDeploymentDatabaseIsolation({ ...hosts, VERCEL_ENV: "preview", DATABASE_URL: url(hosts.JOEY_PREVIEW_DATABASE_HOST) })).not.toThrow();
    expect(() => assertDeploymentDatabaseIsolation({ ...hosts, VERCEL_ENV: "production", DATABASE_URL: url(hosts.JOEY_PRODUCTION_DATABASE_HOST.replace("-pooler", "")) })).not.toThrow();
  });
  it("does not require Vercel configuration for local/self-hosted deployments", () => {
    expect(() => assertDeploymentDatabaseIsolation({ DATABASE_URL: "postgres://localhost/test" })).not.toThrow();
  });
});
