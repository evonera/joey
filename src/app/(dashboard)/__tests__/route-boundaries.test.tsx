import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DashboardError from "../error";
import DashboardLoading from "../loading";

describe("dashboard route boundaries", () => {
  it("announces pending navigation without an empty page", () => {
    render(<DashboardLoading />);
    expect(screen.getByRole("status", { name: "Loading page" })).toBeInTheDocument();
    expect(screen.getByText("Loading page…")).toHaveClass("sr-only");
  });

  it("offers an accessible recovery action after a route failure", () => {
    const reset = vi.fn();
    render(<DashboardError error={new Error("provider unavailable")} reset={reset} />);

    expect(screen.getByRole("alert")).toHaveTextContent("This page couldn’t load");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
