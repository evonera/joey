import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LandingHeader } from "@/components/landing-header";

describe("LandingHeader", () => {
  it("renders Features, Pricing, and Resources nav links", () => {
    render(<LandingHeader />);
    expect(screen.getByRole("button", { name: /Features/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /^Pricing$/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Resources/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /Get Joey Free/i })).toBeDefined();
  });

  it("opens features dropdown when clicked", () => {
    render(<LandingHeader />);
    const featuresBtn = screen.getByRole("button", { name: /Features/i });
    fireEvent.click(featuresBtn);

    expect(screen.getByText("Agent Chat")).toBeDefined();
    expect(screen.getByText("Visual Flows")).toBeDefined();
    expect(screen.getByText("Theme Studio")).toBeDefined();
    expect(screen.getByText("Telegram Approvals")).toBeDefined();
    expect(screen.getByText("Engagement Inbox")).toBeDefined();
  });

  it("opens resources dropdown when clicked", () => {
    render(<LandingHeader />);
    const resourcesBtn = screen.getByRole("button", { name: /Resources/i });
    fireEvent.click(resourcesBtn);

    expect(screen.getByText("Documentation")).toBeDefined();
    expect(screen.getByText("Blog")).toBeDefined();
    expect(screen.getByText("About")).toBeDefined();
    expect(screen.getByText("GitHub")).toBeDefined();
  });
});
