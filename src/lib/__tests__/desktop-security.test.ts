import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Tauri v2 security baseline", () => {
  const root = process.cwd();
  const config = JSON.parse(readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8"));
  const capability = JSON.parse(readFileSync(resolve(root, "src-tauri/capabilities/default.json"), "utf8"));
  const rust = readFileSync(resolve(root, "src-tauri/src/main.rs"), "utf8");
  const releaseWorkflow = readFileSync(resolve(root, ".github/workflows/desktop-release.yml"), "utf8");
  const qualityWorkflow = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");

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

  it("produces signed updater artifacts on every supported desktop platform", () => {
    expect(config.bundle.createUpdaterArtifacts).toBe(true);
    expect(releaseWorkflow).toContain("tauri-apps/tauri-action@1deb371b0cd8bd54025b384f1cd735e725c4060f");
    expect(releaseWorkflow).toContain("Validate release tag matches application version");
    expect(releaseWorkflow).toContain("GITHUB_REF_VALUE: ${{ github.ref }}");
    expect(releaseWorkflow).not.toContain('if [ "${{ github.ref }}"');
    expect(releaseWorkflow).toMatch(/toolchain:\s+stable/);
    expect(qualityWorkflow).toMatch(/toolchain:\s+stable/);
    expect(releaseWorkflow).toContain("TAURI_SIGNING_PRIVATE_KEY:");
    expect(releaseWorkflow).toContain("TAURI_SIGNING_PRIVATE_KEY_PASSWORD:");
    expect(releaseWorkflow).toContain("macos-latest");
    expect(releaseWorkflow).toContain("ubuntu-22.04");
    expect(releaseWorkflow).toContain("windows-latest");
    expect(releaseWorkflow).toContain("--target aarch64-apple-darwin");
    expect(releaseWorkflow).toContain("--target x86_64-apple-darwin");
  });
});
