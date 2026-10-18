import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import NotificationsPage from "../page";
const mocks = vi.hoisted(() => ({ get: vi.fn(), mark: vi.fn(), all: vi.fn(), push: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/app/actions/notifications", () => ({ getNotifications: mocks.get, markAsRead: mocks.mark, markAllAsRead: mocks.all }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
const notification = { id: "notice", title: "Draft ready", body: "Review it", isRead: false, type: "draft_ready", createdAt: new Date(), link: "/drafts" };
beforeEach(() => { mocks.get.mockReset(); mocks.mark.mockReset(); mocks.all.mockReset(); mocks.get.mockResolvedValue({ notifications: [notification] }); mocks.mark.mockResolvedValue({ success: true }); mocks.all.mockResolvedValue({ success: true }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("Notifications failure feedback", () => {
  it("shows a returned fetch error with retry instead of claiming an empty inbox", async () => {
    mocks.get.mockResolvedValueOnce({ error: "Notifications unavailable" });
    render(<NotificationsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Notifications unavailable");
    expect(screen.queryByText("You're all caught up!")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry notifications" }));
    expect(await screen.findByText("Draft ready")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it.each(["Mark read", "Mark all as read"])("does not mark read or report success when %s returns an error", async label => {
    mocks.mark.mockResolvedValue({ error: "Read update failed" });
    mocks.all.mockResolvedValue({ error: "Read update failed" });
    render(<NotificationsPage />);
    fireEvent.click(await screen.findByRole("button", { name: label }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Read update failed");
    expect(screen.getByRole("button", { name: "Mark read" })).toBeEnabled();
    expect(mocks.success).not.toHaveBeenCalled();
  });
  it("ignores a fetch started before a successful mark-all mutation", async () => {
    let finish!: (value: { notifications: typeof notification[] }) => void;
    mocks.get.mockResolvedValueOnce({ notifications: [notification] }).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    render(<NotificationsPage />);
    await screen.findByText("Draft ready");
    await userEvent.click(screen.getByRole("tab", { name: "Unread" }));
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("All notifications marked as read"));
    await act(async () => finish({ notifications: [notification] }));
    expect(screen.queryByText("Draft ready")).not.toBeInTheDocument();
  });
  it("keeps an unread notification visible and stays on the page when opening fails to mark it read", async () => {
    mocks.mark.mockResolvedValue({ error: "Read update failed" });
    render(<NotificationsPage />);
    fireEvent.click(await screen.findByText("Draft ready"));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Read update failed"));
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Mark read" })).toBeInTheDocument();
  });
});
