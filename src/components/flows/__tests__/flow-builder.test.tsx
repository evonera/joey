import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlowBuilder } from "../flow-builder";

const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn(), run: vi.fn(), success: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, info: mocks.info, error: mocks.error, warning: vi.fn() } }));
vi.mock("@/hooks/use-webmcp-tools", () => ({ useWebMcpTools: () => true }));
vi.mock("../runs-panel", () => ({ RunsPanel: ({ open }: { open: boolean }) => open ? <div>Run details opened</div> : null }));
vi.mock("../zod-form", () => ({ ZodForm: () => null }));
vi.mock("@/app/actions/flows", () => ({ saveFlow: mocks.save, runFlow: mocks.run, validateFlowGraph: vi.fn(), validateFlowActivation: vi.fn(), setFlowStatus: vi.fn(), publishTemplate: vi.fn(), provisionFlowWebhookSecret: vi.fn(), rotateFlowWebhookSecret: vi.fn() }));
vi.mock("@xyflow/react", async importOriginal => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return {
    ...actual,
    ReactFlow: ({ onNodesChange, onEdgesChange }: { onNodesChange: (changes: unknown[]) => void; onEdgesChange: (changes: unknown[]) => void }) => <div>
      <button onClick={() => onNodesChange([{ type: "remove", id: "first" }])}>Canvas delete node</button>
      <button onClick={() => onEdgesChange([{ type: "remove", id: "first->second:default" }])}>Canvas delete edge</button>
      <button onClick={() => onNodesChange([{ type: "position", id: "first", position: { x: 50, y: 70 } }])}>Move node</button>
      <button onClick={() => onNodesChange([{ type: "select", id: "first", selected: true }])}>Select node</button>
    </div>,
  };
});
const flow = { id: "flow-safety", name: "Original", description: null, status: "draft", lastRunAt: null, webhookConfigured: false, graph: { nodes: [{ id: "first", type: "trigger.manual", config: {}, position: { x: 0, y: 0 } }, { id: "second", type: "action.notify", config: {}, position: { x: 200, y: 0 } }], edges: [{ from: "first", to: "second" }] } };

beforeEach(() => { sessionStorage.clear(); mocks.save.mockResolvedValue({ ok: true }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("FlowBuilder edit protection", () => {
  it.each(["Canvas delete node", "Canvas delete edge", "Move node"])("tracks %s as an unsaved persisted change", async label => {
    render(<FlowBuilder flow={flow} />);
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(screen.getByRole("button", { name: "Save *" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save *" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    const savedGraph = mocks.save.mock.calls[0][1].graph;
    if (label === "Canvas delete node") expect(savedGraph.nodes).toHaveLength(1);
    if (label === "Canvas delete edge") expect(savedGraph.edges).toHaveLength(0);
    if (label === "Move node") expect(savedGraph.nodes[0].position).toEqual({ x: 50, y: 70 });
  });

  it("does not treat canvas selection as an edit", () => {
    render(<FlowBuilder flow={flow} />);
    fireEvent.click(screen.getByRole("button", { name: "Select node" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("keeps a rename made during saving dirty and saves the new name next", async () => {
    let resolve!: (value: { ok: boolean }) => void;
    mocks.save.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    render(<FlowBuilder flow={flow} />);
    fireEvent.change(screen.getByLabelText("Flow name"), { target: { value: "Reviewed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save *" }));
    fireEvent.change(screen.getByLabelText("Flow name"), { target: { value: "Newer edit" } });
    await act(async () => resolve({ ok: true }));
    expect(screen.getByRole("button", { name: "Save *" })).toBeEnabled();
    expect(mocks.success).not.toHaveBeenCalledWith("Saved");
    expect(mocks.save.mock.calls[0][1].name).toBe("Reviewed");
    fireEvent.click(screen.getByRole("button", { name: "Save *" }));
    await waitFor(() => expect(mocks.save.mock.calls[1][1].name).toBe("Newer edit"));
  });

  it("does not test a saved snapshot after a newer canvas edit arrives", async () => {
    let resolve!: (value: { ok: boolean }) => void;
    mocks.save.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    render(<FlowBuilder flow={flow} />);
    fireEvent.click(screen.getByRole("button", { name: "Test run" }));
    fireEvent.click(screen.getByRole("button", { name: "Canvas delete edge" }));
    await act(async () => resolve({ ok: true }));
    expect(mocks.run).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save *" })).toBeEnabled();
  });

  it("shows a persisted failed run as an error and still opens its details", async () => {
    mocks.run.mockResolvedValueOnce({ runId: "failed-run", status: "failed", error: "Source request was rejected" });
    render(<FlowBuilder flow={flow} />);
    fireEvent.click(screen.getByRole("button", { name: "Test run" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Source request was rejected"));
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByText("Run details opened")).toBeInTheDocument();
  });

  it("reports waiting approval neutrally and opens the runs panel", async () => {
    mocks.run.mockResolvedValueOnce({ runId: "waiting-run", status: "waiting_approval" });
    render(<FlowBuilder flow={flow} />);
    fireEvent.click(screen.getByRole("button", { name: "Test run" }));
    await waitFor(() => expect(mocks.info).toHaveBeenCalledWith("Run is waiting for approval — opening runs panel"));
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
    expect(screen.getByText("Run details opened")).toBeInTheDocument();
  });

  it("offers recovery after navigation and removes recovery after confirmed save", async () => {
    const first = render(<FlowBuilder flow={flow} />);
    fireEvent.change(screen.getByLabelText("Flow name"), { target: { value: "Recovered name" } });
    first.unmount();
    render(<FlowBuilder flow={flow} />);
    expect(screen.getByLabelText("Flow name")).toHaveValue("Original");
    fireEvent.click(await screen.findByRole("button", { name: "Restore edits" }));
    expect(screen.getByLabelText("Flow name")).toHaveValue("Recovered name");
    fireEvent.click(screen.getByRole("button", { name: "Save *" }));
    await waitFor(() => expect(sessionStorage.getItem("joey:flow-draft:flow-safety")).toBeNull());
  });

  it("lets the user cancel sidebar navigation with unsaved edits", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<FlowBuilder flow={flow} />);
    fireEvent.change(screen.getByLabelText("Flow name"), { target: { value: "Unsaved" } });
    const link = screen.getByRole("link", { name: "All flows" });
    expect(fireEvent.click(link)).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });
});
