import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn(), threads: vi.fn(), runs: vi.fn(), state: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/actions/agency", () => ({
  saveAgencyAgentAction: mocks.save,
  getAgencyThreads: mocks.threads,
  getAgencyRuns: mocks.runs,
  setAgencyAgentState: mocks.state,
}));
vi.mock("@/app/_components/agent-chat", () => ({
  AgentChat: ({
    persona,
    initialServerSession,
  }: {
    persona: { name: string };
    initialServerSession?: { sessionId: string };
  }) => (
    <div>
      Chat with {persona.name} {initialServerSession?.sessionId}
    </div>
  ),
}));
import { AgentWizard } from "../agent-wizard";
import { AgencyWorkspace } from "../agency-workspace";
import { AgentAutomationControls } from "../agent-automation-controls";
const agent = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Studio editor",
  description: "Evidence-led writing",
  specialty: "writer",
  avatarShape: "orbit",
  avatarColor: "teal",
  state: "paused",
  configVersion: 1,
  dailyDraftLimit: 3,
  accountIds: [],
  scoutId: null,
  themePageId: null,
};
const choices = { accounts: [], pages: [], scouts: [] };
describe("Original agency UI", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.save.mockResolvedValue(agent);
    mocks.threads.mockResolvedValue([]);
    mocks.runs.mockResolvedValue([]);
  });
  it("explains why daily automation is unavailable without a source", () => {
    render(<AgentAutomationControls agent={agent} choices={choices} onChanged={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Enable daily drafts" })).toBeDisabled();
    expect(screen.getByText(/Add an Instagram source in agent settings/)).toBeDefined();
  });
  it("collapses the mobile roster after selection and lets users reopen it", async () => {
    render(<AgencyWorkspace agents={[agent]} choices={choices} actor={{ tenantId: "tenant", userId: "user", role: "owner" }} />);
    fireEvent.click(screen.getByRole("button", { name: /Studio editor.*Automation paused/ }));
    const toggle = screen.getByRole("button", { name: "Show agents" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide agents" })).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(mocks.threads).toHaveBeenCalled());
  });
  it("requires the explicit draft-only activation confirmation and retains failed setup", async () => {
    mocks.state.mockRejectedValue(new Error("Agency automation is disabled by the operator."));
    render(<AgentAutomationControls agent={{ ...agent, scoutId: "source", themePageId: "page", accountIds: ["one"] }} choices={choices} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Enable daily drafts" }));
    expect(mocks.state).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent("never to publish or schedule");
    fireEvent.click(screen.getByRole("button", { name: "Enable draft-only automation" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("disabled by the operator"));
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(mocks.state).toHaveBeenCalledWith({ id: agent.id, version: 1, state: "active" });
  });
  it("requires a name, then creates through the reviewed paused configuration action", async () => {
    const saved = vi.fn();
    render(<AgentWizard choices={choices} onClose={vi.fn()} onSaved={saved} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Give your agent a name");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Studio editor" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText(/No connected accounts/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Human review only")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Create paused agent" }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith(agent));
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Studio editor", accountIds: [], scoutId: null }),
      undefined
    );
  });
  it("keeps setup open and shows a failed save without silently activating", async () => {
    mocks.save.mockRejectedValue(new Error("Configuration changed. Refresh first."));
    render(<AgentWizard agent={agent} choices={choices} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and pause" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Configuration changed"));
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(mocks.save).toHaveBeenCalledWith(expect.anything(), { id: agent.id, version: 1 });
  });
  it("filters the roster and resumes only server-owned conversation entries", async () => {
    mocks.threads.mockResolvedValue([
      { id: "thread", sessionId: "owned-session", title: "Launch research", status: "ready", configVersion: 1 },
    ]);
    render(
      <AgencyWorkspace
        agents={[agent]}
        choices={choices}
        actor={{ tenantId: "tenant", userId: "user", role: "member" }}
      />
    );
    fireEvent.change(screen.getByLabelText("Search agents"), { target: { value: "not there" } });
    expect(screen.getByText("No matching agents.")).toBeDefined();
    fireEvent.change(screen.getByLabelText("Search agents"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Studio editor.*Automation paused/ }));
    await waitFor(() => expect(screen.getByRole("option", { name: "Launch research · ready" })).toBeDefined());
    fireEvent.change(screen.getByLabelText("Resume conversation"), { target: { value: "owned-session" } });
    expect(screen.getByText(/Chat with Studio editor owned-session/)).toBeDefined();
    expect(screen.queryByText(/Bypass all/)).toBeNull();
  });
  it("links historical drafts to their original page, not the current agent binding", async () => {
    mocks.runs.mockResolvedValue([{ id: "run", status: "completed", attempt: 1, configVersion: 1, packageId: "old-package", packageThemePageId: "original-page" }]);
    render(<AgencyWorkspace agents={[{ ...agent, themePageId: "new-page" }]} choices={choices} actor={{ tenantId: "tenant", userId: "user", role: "owner" }}/>);
    fireEvent.click(screen.getByRole("button", { name: /Studio editor.*Automation paused/ }));
    await waitFor(() => expect(screen.getByText("Review draft in Theme Studio")).toHaveAttribute("href", "/theme-studio/original-page"));
    expect(screen.getByRole("combobox", { name: "Resume conversation" })).toBeDisabled();
  });
});
