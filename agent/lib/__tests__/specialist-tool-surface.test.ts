import { describe, expect, it, vi } from "vitest";
vi.mock("eve/tools", () => ({ disableTool: () => ({ disabled: true }) }));
vi.mock("eve/sandbox", () => ({ defineSandbox: (value: unknown) => value, defaultBackend: (value: unknown) => value }));
import rootSandbox from "../../sandbox";
import linkedinSandbox from "../../subagents/linkedin/sandbox";
import twitterSandbox from "../../subagents/twitter/sandbox";
import linkedinBash from "../../subagents/linkedin/tools/bash";
import linkedinRead from "../../subagents/linkedin/tools/read_file";
import linkedinWrite from "../../subagents/linkedin/tools/write_file";
import linkedinFetch from "../../subagents/linkedin/tools/web_fetch";
import twitterBash from "../../subagents/twitter/tools/bash";
import twitterRead from "../../subagents/twitter/tools/read_file";
import twitterWrite from "../../subagents/twitter/tools/write_file";
import twitterFetch from "../../subagents/twitter/tools/web_fetch";

describe("Declared specialist least-privilege slots", () => {
  it("explicitly disables shell, filesystem and fetch tools for each specialist", () => {
    for (const tool of [linkedinBash, linkedinRead, linkedinWrite, linkedinFetch, twitterBash, twitterRead, twitterWrite, twitterFetch]) {
      expect(tool).toEqual({ disabled: true });
    }
  });
  it("mounts the same deny-all sandbox policy in both isolated specialists", () => {
    expect(linkedinSandbox).toBe(rootSandbox);
    expect(twitterSandbox).toBe(rootSandbox);
    expect(rootSandbox).toMatchObject({ backend: {
      vercel: { networkPolicy: "deny-all" }, docker: { networkPolicy: "deny-all" }, microsandbox: { networkPolicy: "deny-all" },
    } });
  });
});
