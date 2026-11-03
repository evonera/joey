import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findFirst: vi.fn(), insert: vi.fn(), role: vi.fn(async () => "workspace-a") }));
vi.mock("@/lib/db", () => ({ db: { query: { flowTemplates: { findMany: mocks.findMany, findFirst: mocks.findFirst } }, insert: mocks.insert } }));
vi.mock("@/lib/auth", () => ({ getActiveTenantId: async () => "workspace-a", requireRole: mocks.role }));
import { listTemplates, installTemplate, publishTemplate } from "../flows";

describe("flow template privacy", () => {
  it("disallows publishing a graph with potentially private credentials", async () => {
    await expect(publishTemplate("flow", { name: "Flow" })).resolves.toHaveProperty("error");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("restricts template listing to official or the user's workspace", async () => {
    // Official seeding is conflict-safe and does not affect the query predicate.
    mocks.insert.mockReturnValue({ values: () => ({ onConflictDoUpdate: async () => undefined }) });
    mocks.findMany.mockResolvedValue([]);
    await listTemplates();
    const query = new PgDialect().sqlToQuery(mocks.findMany.mock.calls.at(-1)![0].where);
    expect(query.sql).toContain('"is_official"');
    expect(query.sql).toContain('"author_tenant_id"');
    expect(query.params).toEqual(expect.arrayContaining([true, "workspace-a"]));
  });
  it("restricts installation by template id and workspace or official status", async () => {
    mocks.findFirst.mockResolvedValue(undefined);
    expect(await installTemplate("foreign-template")).toEqual({ error: "Template not found" });
    const query = new PgDialect().sqlToQuery(mocks.findFirst.mock.calls.at(-1)![0].where);
    expect(query.params).toEqual(expect.arrayContaining(["foreign-template", true, "workspace-a"]));
    expect(query.sql).toContain('"author_tenant_id"');
  });
});
