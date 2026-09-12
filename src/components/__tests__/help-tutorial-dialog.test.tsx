import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  getProductTourProgress: vi.fn(),
  startProductTour: vi.fn(),
}));

vi.mock("@/app/actions/onboarding-tour", () => ({
  getProductTourProgress: mocks.getProductTourProgress,
}));

vi.mock("@/components/product-tour", () => ({
  startProductTour: mocks.startProductTour,
}));

import { HelpTutorialDialog } from "@/components/help-tutorial-dialog";

describe("HelpTutorialDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProductTourProgress.mockResolvedValue(null);
  });

  it("renders help trigger button", () => {
    render(<HelpTutorialDialog />);
    const trigger = screen.getByRole("button", { name: /Help & Tutorial Guide/i });
    expect(trigger).toBeDefined();
  });

  it("opens modal with tabs when clicked", async () => {
    render(<HelpTutorialDialog />);
    const trigger = screen.getByRole("button", { name: /Help & Tutorial Guide/i });
    fireEvent.click(trigger);

    expect(screen.getByText("Joey Guide & Tutorials")).toBeDefined();
    expect(screen.getByText("Workflow")).toBeDefined();
    expect(screen.getByText("Chat & Models")).toBeDefined();
    expect(screen.getByText("Flows")).toBeDefined();
    expect(screen.getByText("Theme Studio")).toBeDefined();
    expect(screen.getByText("Telegram")).toBeDefined();
    expect(await screen.findByRole("button", { name: /Start interactive tour/i })).toBeEnabled();
  });

  it("labels a paused tour with its resumable step", async () => {
    mocks.getProductTourProgress.mockResolvedValue({ currentStep: 2, status: "dismissed" });
    render(<HelpTutorialDialog />);

    fireEvent.click(screen.getByRole("button", { name: /Help & Tutorial Guide/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Resume interactive tour at step 3/i })).toBeDefined();
    });
  });

  it("offers a fresh restart after completion", async () => {
    mocks.getProductTourProgress.mockResolvedValue({ currentStep: 5, status: "completed" });
    render(<HelpTutorialDialog />);

    fireEvent.click(screen.getByRole("button", { name: /Help & Tutorial Guide/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Restart interactive tour/i })).toBeDefined();
    });
  });

  it("blocks a stale tour action until reopened progress finishes loading", async () => {
    let resolveProgress: ((value: { currentStep: number; status: "in_progress" }) => void) | undefined;
    mocks.getProductTourProgress.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveProgress = resolve;
      }),
    );
    render(<HelpTutorialDialog />);

    fireEvent.click(screen.getByRole("button", { name: /Help & Tutorial Guide/i }));

    const loadingButton = screen.getByRole("button", { name: /Loading tour/i });
    expect(loadingButton).toBeDisabled();
    expect(loadingButton).toHaveClass("w-full");
    fireEvent.click(loadingButton);
    expect(mocks.startProductTour).not.toHaveBeenCalled();

    resolveProgress?.({ currentStep: 3, status: "in_progress" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Resume interactive tour at step 4/i })).toBeEnabled();
    });
  });
});
