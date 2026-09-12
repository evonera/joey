import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ prefetch, ...props }: React.ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a {...props} data-prefetch={String(prefetch)} />
  ),
}));

import { LandingLink } from "@/components/landing-link";

describe("LandingLink", () => {
  it("disables automatic segment prefetching", () => {
    render(<LandingLink href="/docs">Docs</LandingLink>);

    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute("data-prefetch", "false");
  });

  it("does not allow a caller to re-enable the affected prefetch path", () => {
    render(
      <LandingLink href="/signup" prefetch>
        Sign up
      </LandingLink>
    );

    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("data-prefetch", "false");
  });
});
