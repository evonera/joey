import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HelpTutorialDialog } from "@/components/help-tutorial-dialog";

describe("HelpTutorialDialog", () => {
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
    expect(screen.getByText(/Relaunch Full Onboarding Walkthrough/i)).toBeDefined();
  });
});
