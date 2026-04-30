import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountSection } from "../AccountSection";

// Mock supabase client
const updateUserMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      updateUser: (...args: unknown[]) => updateUserMock(...args),
    },
  },
}));

// Mock toast
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock DeleteAccountDialog (not relevant here, avoid pulling deps)
vi.mock("@/components/settings/DeleteAccountDialog", () => ({
  DeleteAccountDialog: () => <div data-testid="delete-dialog" />,
}));

const renderSection = (currentEmail = "current@example.com") =>
  render(<AccountSection userId="user-123" currentEmail={currentEmail} />);

describe("AccountSection — email", () => {
  beforeEach(() => {
    updateUserMock.mockReset();
  });

  it("shows inline error for invalid email and does not call updateUser", async () => {
    const user = userEvent.setup();
    renderSection();

    const input = screen.getByLabelText(/email address/i);
    await user.type(input, "not-an-email");
    await user.click(screen.getByRole("button", { name: /change email/i }));

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent(/valid email/i);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("shows inline error when new email matches current email", async () => {
    const user = userEvent.setup();
    renderSection("current@example.com");

    await user.type(screen.getByLabelText(/email address/i), "Current@Example.com");
    await user.click(screen.getByRole("button", { name: /change email/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/already your current email/i);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("calls supabase.auth.updateUser with email + redirect for valid input", async () => {
    updateUserMock.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderSection();

    await user.type(screen.getByLabelText(/email address/i), "new@example.com");
    await user.click(screen.getByRole("button", { name: /change email/i }));

    await waitFor(() => expect(updateUserMock).toHaveBeenCalledTimes(1));
    expect(updateUserMock).toHaveBeenCalledWith(
      { email: "new@example.com" },
      { emailRedirectTo: `${window.location.origin}/verification-success` }
    );
  });
});

describe("AccountSection — password", () => {
  beforeEach(() => {
    updateUserMock.mockReset();
  });

  it("shows inline error for weak password and does not call updateUser", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.type(screen.getByLabelText(/^new password$/i), "short");
    await user.type(screen.getByLabelText(/confirm new password/i), "short");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((el) => /at least 8 characters/i.test(el.textContent || ""))).toBe(true);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("shows inline error when password is missing required character classes", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.type(screen.getByLabelText(/^new password$/i), "alllowercase1");
    await user.type(screen.getByLabelText(/confirm new password/i), "alllowercase1");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((el) => /uppercase/i.test(el.textContent || ""))).toBe(true);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("shows inline error when confirmation does not match", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.type(screen.getByLabelText(/^new password$/i), "ValidPass1");
    await user.type(screen.getByLabelText(/confirm new password/i), "Different1A");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((el) => /don't match/i.test(el.textContent || ""))).toBe(true);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("calls supabase.auth.updateUser with password for valid matching input", async () => {
    updateUserMock.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderSection();

    await user.type(screen.getByLabelText(/^new password$/i), "ValidPass1");
    await user.type(screen.getByLabelText(/confirm new password/i), "ValidPass1");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => expect(updateUserMock).toHaveBeenCalledTimes(1));
    expect(updateUserMock).toHaveBeenCalledWith({ password: "ValidPass1" });
  });

  it("surfaces server error inline when updateUser rejects", async () => {
    updateUserMock.mockResolvedValue({ error: new Error("Network down") });
    const user = userEvent.setup();
    renderSection();

    await user.type(screen.getByLabelText(/^new password$/i), "ValidPass1");
    await user.type(screen.getByLabelText(/confirm new password/i), "ValidPass1");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/network down/i);
  });
});