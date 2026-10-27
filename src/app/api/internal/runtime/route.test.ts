import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ execute: vi.fn(), storage: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { execute: mocks.execute } }));
vi.mock("@/lib/theme-studio/runtime-readiness", () => ({ themeMediaStorageReady: mocks.storage }));
import { GET } from "./route";

describe("read-only runtime probe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.MEDIA_ENGINE_ENABLED = "true";
    process.env.MEDIA_WORKER_SECRET = "x".repeat(64);
    process.env.MEDIA_WORKER_DISPATCH_URL = "https://worker.modal.run";
    mocks.execute.mockResolvedValue({ rows: [{ columns: 4, indexes: 4 }] });
    mocks.storage.mockReturnValue(true);
  });
  const request = () => new Request("https://joey.example/api/internal/runtime", { headers: { authorization: "Bearer test-cron-secret" } });
  it("does not expose readiness without scheduler authentication", async () => {
    expect((await GET(new Request("https://joey.example/api/internal/runtime"))).status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("allows scheduler work without optional media configuration when media is disabled", async () => {
    process.env.MEDIA_ENGINE_ENABLED = "false";
    delete process.env.MEDIA_WORKER_SECRET;
    delete process.env.MEDIA_WORKER_DISPATCH_URL;
    mocks.storage.mockReturnValue(false);
    const result = await GET(request());
    expect(result.status).toBe(200);
  });
  it("reports media failures without blocking unrelated scheduled work", async () => {
    mocks.storage.mockReturnValue(false);
    delete process.env.MEDIA_WORKER_SECRET;
    const result = await GET(request());
    expect(result.status).toBe(200);
    expect((await result.json()).mediaReady).toBe(false);
  });
  it("blocks rollout when the source health migration is absent", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [{ columns: 0, indexes: 3 }] });
    const result = await GET(request());
    expect(result.status).toBe(503);
    expect((await result.json()).checks.schema).toBe(false);
  });
  it("supports both Neon result objects and Postgres row arrays", async () => {
    expect((await GET(request())).status).toBe(200);
    mocks.execute.mockResolvedValueOnce([{ columns: 4, indexes: 4 }]);
    expect((await GET(request())).status).toBe(200);
  });
  it("blocks rollout before publication recovery is migrated", async () => {
    mocks.execute.mockResolvedValueOnce([{ columns: 3, indexes: 3 }]);
    expect((await GET(request())).status).toBe(503);
  });
});
