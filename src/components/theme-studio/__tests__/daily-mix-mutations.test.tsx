import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DailyMixScheduler } from "../DailyMixScheduler";

const mocks = vi.hoisted(() => ({ load: vi.fn(), accept: vi.fn(), discard: vi.fn(), error: vi.fn() }));
vi.mock("@/app/actions/mix-recommendations", () => ({
  getMixRecommendations: mocks.load, acceptRecommendation: mocks.accept, discardRecommendation: mocks.discard,
}));
vi.mock("@/app/actions/theme-slots", () => ({
  createThemeSlot: vi.fn(), updateThemeSlot: vi.fn(), deleteThemeSlot: vi.fn(), reorderThemeSlots: vi.fn(), getThemeSlots: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: vi.fn() } }));

const props = { themePageId: "page", initialSlots: [], availableFormats: [], availableTemplates: [] };
const recommendation = { id: "recommendation", formatScores: {}, adjustments: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue({ recommendation });
});

describe("daily mix recommendation recovery", () => {
  it("prevents acceptance while dismissal is pending and restores controls after failure", async () => {
    let fail!: (error: Error) => void;
    mocks.discard.mockReturnValue(new Promise((_resolve, reject) => { fail = reject; }));
    render(<DailyMixScheduler {...props} />);
    const dismiss = await screen.findByRole("button", { name: "Dismiss" });
    const apply = screen.getByRole("button", { name: "Apply Reorder" });
    fireEvent.click(dismiss);
    expect(apply).toBeDisabled();
    fireEvent.click(apply);
    fireEvent.click(dismiss);
    expect(mocks.accept).not.toHaveBeenCalled();
    expect(mocks.discard).toHaveBeenCalledTimes(1);
    await act(async () => { fail(new Error("Provider unavailable")); });
    await waitFor(() => expect(apply).not.toBeDisabled());
    expect(mocks.error).toHaveBeenCalledWith("Provider unavailable");
  });

  it("reports recommendation loading failures without an unhandled rejection", async () => {
    mocks.load.mockRejectedValue(new Error("Database unavailable"));
    render(<DailyMixScheduler {...props} />);
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Could not load mix recommendations. Refresh to try again."));
    expect(screen.queryByRole("button", { name: "Apply Reorder" })).not.toBeInTheDocument();
  });
});
