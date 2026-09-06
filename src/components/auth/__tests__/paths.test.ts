import { describe, it, expect } from "vitest";
import { resolveAuthPath } from "../paths";

describe("Auth Paths Utility", () => {
  it("resolves root-relative auth paths when basePath is empty", () => {
    expect(resolveAuthPath("", "login")).toBe("/login");
    expect(resolveAuthPath("", "signup")).toBe("/signup");
    expect(resolveAuthPath("", "forgot-password")).toBe("/forgot-password");
    expect(resolveAuthPath("", "reset-password")).toBe("/reset-password");
    expect(resolveAuthPath("", "reset-link-sent")).toBe("/reset-link-sent");
  });

  it("resolves paths when basePath is undefined or slash", () => {
    expect(resolveAuthPath(undefined, "login")).toBe("/login");
    expect(resolveAuthPath("/", "signup")).toBe("/signup");
    expect(resolveAuthPath("///", "forgot-password")).toBe("/forgot-password");
  });

  it("handles leading and trailing slashes safely without double slashes", () => {
    expect(resolveAuthPath("", "/login")).toBe("/login");
    expect(resolveAuthPath("/auth/", "/login")).toBe("/auth/login");
    expect(resolveAuthPath("/auth", "signup")).toBe("/auth/signup");
  });

  it("preserves custom base paths when provided", () => {
    expect(resolveAuthPath("/custom-auth", "login")).toBe("/custom-auth/login");
  });
});
