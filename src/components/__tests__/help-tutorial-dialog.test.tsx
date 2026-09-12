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

  it("opens modal with tabs when clicked", () => {
    render(<HelpTutorialDialog />);
    const trigger = screen.getByRole("button", { name: /Help & Tutorial Guide/i });
    fireEvent.click(trigger);

    expect(screen.getByText("Joey Guide & Tutorials")).toBeDefined();
    expect(screen.getByText("Workflow")).toBeDefined();
    expect(screen.getByText("Chat & Models")).toBeDefined();
    expect(screen.getByText("Flows")).toBeDefined();
    expect(screen.getByText("Theme Studio")).toBeDefined();
    expect(screen.getByText("Telegram")).toBeDefined();
    expect(screen.getByText(/Start interactive tour/i)).toBeDefined();
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
});
