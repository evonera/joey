import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

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

import { ProductTour, PRODUCT_TOUR_STEPS } from "@/components/product-tour";

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
});
