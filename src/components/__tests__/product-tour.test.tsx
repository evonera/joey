import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  getProductTourProgress: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  startProductTourProgress: vi.fn(),
  updateProductTourProgress: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/app/actions/onboarding-tour", () => ({
  getProductTourProgress: mocks.getProductTourProgress,
  startProductTourProgress: mocks.startProductTourProgress,
  updateProductTourProgress: mocks.updateProductTourProgress,
}));

import { ProductTour, PRODUCT_TOUR_STEPS, startProductTour } from "@/components/product-tour";

describe("ProductTour", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProductTourProgress.mockResolvedValue(null);
    mocks.startProductTourProgress.mockResolvedValue({ currentStep: 0, status: "in_progress" });
    mocks.updateProductTourProgress.mockResolvedValue({ currentStep: 0, status: "in_progress" });
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(async () => {
    await act(async () => {
      document.querySelectorAll("[data-test-tour-target]").forEach((element) => element.remove());
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  });

  it("uses page-level targets for every route in the guided workflow", () => {
    expect(PRODUCT_TOUR_STEPS.map((step) => step.target)).toEqual([
      "[data-tour='chat-composer']",
      "[data-tour='chat-accounts']",
      "[data-tour='compose-overview']",
      "[data-tour='theme-studio-overview']",
      "[data-tour='flows-overview']",
      "[data-tour='accounts-connect']",
    ]);
  });

  it("detects a target that mounts after the route transition", async () => {
    const disconnectSpy = vi.spyOn(MutationObserver.prototype, "disconnect");
    mocks.getProductTourProgress.mockResolvedValueOnce({ currentStep: 0, status: "in_progress" });
    render(<ProductTour />);

    await screen.findByRole("dialog", { name: "Joey product tour" });
    expect(screen.getByText(/matching control is unavailable/i)).toBeDefined();

    const target = document.createElement("div");
    target.dataset.tour = "chat-composer";
    target.dataset.testTourTarget = "true";
    target.getBoundingClientRect = () => DOMRect.fromRect({ x: 40, y: 80, width: 320, height: 120 });
    await act(async () => {
      document.body.appendChild(target);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(screen.queryByText(/matching control is unavailable/i)).toBeNull();
    });
    expect(target.scrollIntoView).toHaveBeenCalled();
    expect(disconnectSpy).toHaveBeenCalled();
    disconnectSpy.mockRestore();
  });

  it("does not advance or accept a second click before the checkpoint is durable", async () => {
    mocks.getProductTourProgress.mockResolvedValueOnce({ currentStep: 0, status: "in_progress" });
    let acknowledge!: (value: { currentStep: number; status: string }) => void;
    mocks.updateProductTourProgress.mockReturnValueOnce(new Promise(resolve => { acknowledge = resolve; }));
    render(<ProductTour />);
    await screen.findByText("Step 1 of 6");
    fireEvent.click(screen.getByRole("button", { name: /^Next$/ }));
    await screen.findByRole("status");
    expect(screen.getByText("Step 1 of 6")).toBeDefined();
    expect((screen.getByRole("button", { name: /^Next$/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^Next$/ }));
    expect(mocks.updateProductTourProgress).toHaveBeenCalledTimes(1);
    await act(async () => acknowledge({ currentStep: 1, status: "in_progress" }));
    await screen.findByText("Step 2 of 6");
  });

  it("keeps a failed checkpoint visible and retries it before advancing", async () => {
    mocks.getProductTourProgress.mockResolvedValueOnce({ currentStep: 0, status: "in_progress" });
    mocks.updateProductTourProgress.mockRejectedValueOnce(new Error("offline"));
    render(<ProductTour />);
    await screen.findByText("Step 1 of 6");
    fireEvent.click(screen.getByRole("button", { name: /^Next$/ }));
    await screen.findByRole("alert");
    expect(screen.getByText("Step 1 of 6")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
    await screen.findByText("Step 2 of 6");
    expect(mocks.updateProductTourProgress).toHaveBeenNthCalledWith(2, { currentStep: 1, status: "in_progress" });
  });

  it("keeps a pause visible until saved and queues a restart behind that write", async () => {
    mocks.getProductTourProgress.mockResolvedValueOnce({ currentStep: 1, status: "in_progress" });
    let acknowledge!: (value: { currentStep: number; status: string }) => void;
    mocks.updateProductTourProgress.mockReturnValueOnce(new Promise(resolve => { acknowledge = resolve; }));
    render(<ProductTour />);
    await screen.findByText("Step 2 of 6");
    fireEvent.click(screen.getByRole("button", { name: "Pause tour" }));
    await screen.findByRole("status");
    act(() => startProductTour(true));
    expect(mocks.startProductTourProgress).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Joey product tour" })).toBeDefined();
    await act(async () => acknowledge({ currentStep: 1, status: "dismissed" }));
    await screen.findByText("Step 1 of 6");
    expect(mocks.startProductTourProgress).toHaveBeenCalledWith(true);
  });

  it("keeps missing-target fallback keyboard usable and restores focus after Escape", async () => {
    mocks.getProductTourProgress.mockResolvedValueOnce({ currentStep: 0, status: "in_progress" });
    const opener = document.createElement("button");
    opener.dataset.testTourTarget = "true";
    document.body.appendChild(opener);
    opener.focus();
    render(<ProductTour />);
    await screen.findByText(/matching control is unavailable/i);
    const next = screen.getByRole("button", { name: /^Next$/ });
    const pause = screen.getByRole("button", { name: "Pause tour" });
    const card = screen.getByRole("heading", { name: "AI Chat" }).closest("section");
    await waitFor(() => expect(document.activeElement).toBe(card));
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(pause);
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(next);
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Joey product tour" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});
