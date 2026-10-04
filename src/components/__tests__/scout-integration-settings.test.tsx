import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ setup: vi.fn(), getKey: vi.fn() }));
vi.mock("@/app/actions/scouts", () => ({ getScoutSetup: mocks.setup }));
vi.mock("@/app/actions/api-keys", () => ({ getApiKey: mocks.getKey, saveApiKey: vi.fn(), deleteApiKey: vi.fn() }));
import { IntegrationsPanel } from "@/app/(dashboard)/settings/integrations-panel";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getKey.mockResolvedValue(null);
});

describe("Operator-configured Scout integration", () => {
  it("keeps the default public BYOK integrations without advertising a cloud service", async () => {
    mocks.setup.mockResolvedValue({ ready: true, provider: "apify", customEnabled: false });
    render(<IntegrationsPanel />);
    await waitFor(() => expect(mocks.getKey).toHaveBeenCalledWith("tavily"));
    expect(screen.queryByLabelText("Custom Scout provider API key")).not.toBeInTheDocument();
  });
  it("shows a workspace key field only when the operator enables a custom endpoint", async () => {
    mocks.setup.mockResolvedValue({ ready: false, provider: "custom", customEnabled: true });
    render(<IntegrationsPanel />);
    await waitFor(() => expect(mocks.getKey).toHaveBeenCalledWith("scout-data"));
    expect(screen.getByLabelText("Custom Scout provider API key")).toHaveAttribute("type", "password");
    expect(screen.getByText(/Collection endpoint configured by your Joey operator/)).toBeInTheDocument();
  });
});
