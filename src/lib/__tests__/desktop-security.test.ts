import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Tauri v2 security baseline", () => {
  const root = process.cwd();
  const config = JSON.parse(readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8"));
  const capability = JSON.parse(readFileSync(resolve(root, "src-tauri/capabilities/default.json"), "utf8"));
  const rust = readFileSync(resolve(root, "src-tauri/src/main.rs"), "utf8");

  it("explicitly enables only the bundled default capability", () => {
    expect(config.app.security.capabilities).toEqual(["default"]);
    expect(capability.remote).toBeUndefined();
    expect(capability.windows).toEqual(["main"]);
    expect(capability.permissions).not.toContain("core:default");
  });

  it("enforces a CSP without remote scripts or connections", () => {
    expect(config.app.security.csp["script-src"]).toBe("'self'");
    expect(config.app.security.csp["connect-src"]).not.toContain("https:");
    expect(config.app.security.csp["object-src"]).toBe("'none'");
  });

  it("does not expose plaintext token storage commands to the remote UI", () => {
    expect(rust).not.toContain("save_auth_token");
    expect(rust).not.toContain("tauri_plugin_store");
    expect(rust).not.toContain("invoke_handler");
  });

  it("does not mutate application source during desktop builds and restricts navigation", () => {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
    expect(pkg.scripts["build:desktop"]).toBe("tauri build");
    expect(rust).toContain("WebviewWindowBuilder");
    expect(rust).toContain("on_navigation");
    expect(config.app.windows).toEqual([]);
  });
});
