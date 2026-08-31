import { describe, expect, it, vi } from "vitest";
import { runReservedUpload } from "../asset-registration";

describe("durable R2 reservation protocol", () => {
  it("reserves before uploading and registers before completing", async () => {
    const order: string[] = [];
    await expect(runReservedUpload({ reserve: async () => { order.push("reserve"); }, upload: async () => { order.push("upload"); }, register: async () => { order.push("register"); return "asset"; }, compensate: vi.fn(), rearm: vi.fn() })).resolves.toBe("asset");
    expect(order).toEqual(["reserve", "upload", "register"]);
  });

  it("leaves the reservation to clean a crash or upload failure", async () => {
    const compensate = vi.fn();
    await expect(runReservedUpload({ reserve: vi.fn(), upload: async () => { throw new Error("upload failed"); }, register: vi.fn(), compensate, rearm: vi.fn() })).rejects.toThrow("upload failed");
    expect(compensate).not.toHaveBeenCalled();
  });

  it("compensates an uploaded object when registration fails", async () => {
    const compensate = vi.fn(async () => undefined);
    await expect(runReservedUpload({ reserve: vi.fn(), upload: vi.fn(), register: async () => { throw new Error("db failed"); }, compensate, rearm: vi.fn() })).rejects.toThrow("db failed");
    expect(compensate).toHaveBeenCalledOnce();
  });

  it("re-arms durable cleanup when compensation fails", async () => {
    const rearm = vi.fn(async () => undefined);
    await expect(runReservedUpload({ reserve: vi.fn(), upload: vi.fn(), register: async () => { throw new Error("db failed"); }, compensate: async () => { throw new Error("r2 unavailable"); }, rearm })).rejects.toThrow("db failed");
    expect(rearm).toHaveBeenCalledOnce();
  });
});
