import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ connect: vi.fn(), read: vi.fn(), end: vi.fn() }));
vi.mock("postgres", () => ({ default: mocks.connect }));
import { requireDisposableDatabase } from "./require-disposable-database";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("JOEY_INTEGRATION_TEST", "true");
  vi.stubEnv("DATABASE_URL", "postgres://test:test@branch.neon.tech/test");
  vi.stubEnv("JOEY_NEON_TEST_BRANCH_ID", "br-disposable");
  mocks.connect.mockReturnValue(Object.assign(mocks.read, { end: mocks.end }));
  mocks.read.mockResolvedValue([{ branchId: "br-disposable" }]);
});
afterEach(() => vi.unstubAllEnvs());
describe("Authenticated acceptance database guard", () => {
  it("refuses missing opt-in even for localhost", async () => {
    vi.stubEnv("JOEY_INTEGRATION_TEST", "");
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost/test");
    await expect(requireDisposableDatabase()).rejects.toThrow("JOEY_INTEGRATION_TEST");
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("allows an explicitly opted-in local database", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost/test");
    await expect(requireDisposableDatabase()).resolves.toBeUndefined();
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("refuses a shared non-Neon remote database", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://test:test@shared.example.com/test");
    await expect(requireDisposableDatabase()).rejects.toThrow("disposable");
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("checks immutable Neon branch identity and closes the connection", async () => {
    await expect(requireDisposableDatabase()).resolves.toBeUndefined();
    expect(mocks.read).toHaveBeenCalledOnce();
    expect(mocks.end).toHaveBeenCalledWith({ timeout: 5 });
  });
  it("refuses a stale/mismatched cloud connection and still closes it", async () => {
    mocks.read.mockResolvedValue([{ branchId: "br-production" }]);
    await expect(requireDisposableDatabase()).rejects.toThrow("does not match");
    expect(mocks.end).toHaveBeenCalledOnce();
  });
});
