import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PublishConfirmDialog } from "../publish-confirm-dialog";

describe("publication confirmation", () => {
  it("shows the full post, including text beyond the first 220 characters", () => {
    const content = `${"A".repeat(250)} Final sentence.`;
    render(<PublishConfirmDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} isPublishing={false}
      accounts={[{ id: "account-1", accountName: "Account", platform: "x" }]} content={content} />);
    expect(screen.getByText(content)).toBeInTheDocument();
  });
});
