import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionsPanel } from "./connections-panel";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("connected app removal", () => {
  it.each([true, false])("only removes the account when the request succeeds: %s", async (success) => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ connections: [{ toolkit: "slack", accounts: [{ id: "one", alias: "Work", label: null, status: "active" }] }], checked: [] }) }).mockResolvedValueOnce({ ok: success });
    vi.stubGlobal("fetch", fetchMock);
    render(<ConnectionsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect slack Work" }));
    if (success) await waitFor(() => expect(screen.queryByText("Work")).not.toBeInTheDocument());
    else { await waitFor(() => expect(toast.error).toHaveBeenCalled()); expect(screen.getByText("Work")).toBeInTheDocument(); }
  });
});
