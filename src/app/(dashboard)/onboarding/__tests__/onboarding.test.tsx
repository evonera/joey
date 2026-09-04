import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import OnboardingPage from "@/app/(dashboard)/onboarding/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/app/actions/api-keys", () => ({
  saveApiKey: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/app/actions/agent", () => ({
  getAgentConfig: vi.fn().mockResolvedValue({ config: null }),
  saveAgentConfig: vi.fn().mockResolvedValue({ ok: true }),
}));

describe("OnboardingPage", () => {
  it("renders step 1 with welcome message and mascot", () => {
    render(<OnboardingPage />);
    expect(screen.getByText("Welcome to Joey!")).toBeDefined();
    expect(screen.getByText("Let's Get Started")).toBeDefined();
    expect(screen.getByText("Skip to Dashboard →")).toBeDefined();
  });

  it("navigates from step 1 to step 2 (AI Engine)", () => {
    render(<OnboardingPage />);
    const nextBtn = screen.getByRole("button", { name: /Let's Get Started/i });
    fireEvent.click(nextBtn);

    expect(screen.getByText("Choose Your AI Engine")).toBeDefined();
    expect(screen.getByText("Google Gemini")).toBeDefined();
    expect(screen.getByText("OpenAI")).toBeDefined();
    expect(screen.getByText("Anthropic")).toBeDefined();
  });
});
