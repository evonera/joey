import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { JoeyLogo } from "@/components/joey-logo";

describe("JoeyLogo", () => {
  it("renders with default mascot image and text", () => {
    render(<JoeyLogo />);
    expect(screen.getByAltText("Joey Mascot")).toBeDefined();
    expect(screen.getByText("Joey")).toBeDefined();
  });

  it("renders without text when showText is false", () => {
    render(<JoeyLogo showText={false} />);
    expect(screen.getByAltText("Joey Mascot")).toBeDefined();
    expect(screen.queryByText("Joey")).toBeNull();
  });

  it("links to custom href when provided", () => {
    const { container } = render(<JoeyLogo href="/dashboard" />);
    const anchor = container.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe("/dashboard");
  });
});
