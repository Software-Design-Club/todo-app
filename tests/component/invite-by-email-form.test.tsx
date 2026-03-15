import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// vi.hoisted ensures these mock fns are available inside vi.mock factory closures
const { mockInviteCollaborator, mockToastSuccess, mockToastError, mockRouterRefresh } =
  vi.hoisted(() => ({
    mockInviteCollaborator: vi.fn(),
    mockToastSuccess: vi.fn(),
    mockToastError: vi.fn(),
    mockRouterRefresh: vi.fn(),
  }));

vi.mock("@/app/lists/_actions/invitations", () => ({
  inviteCollaborator: mockInviteCollaborator,
}));

vi.mock("sonner", () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

import { InviteByEmailForm } from "@/app/lists/_components/invite-by-email-form";
import type {
  InvitationExpiry,
  InvitationId,
  ListId,
  NormalizedEmailAddress,
  SentInvitationSummary,
} from "@/lib/types";

const LIST_ID = 42 as unknown as ListId;

const SUCCESS_INVITATION: SentInvitationSummary = {
  kind: "sent",
  invitationId: 1 as InvitationId,
  listId: LIST_ID,
  invitedEmailNormalized: "test@example.com" as NormalizedEmailAddress,
  expiresAt: new Date("2026-04-01") as InvitationExpiry,
};

async function fillAndSubmit(email: string) {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("Invite by email"), email);
  await user.click(screen.getByRole("button", { name: /send invite/i }));
}

describe("InviteByEmailForm feedback routing (Contract C.1)", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("C.1.1 — success with onSuccess provided", () => {
    it("calls onSuccess and does NOT call toast.success", async () => {
      mockInviteCollaborator.mockResolvedValue({
        kind: "success",
        invitation: SUCCESS_INVITATION,
      });
      const onSuccess = vi.fn();

      render(<InviteByEmailForm listId={LIST_ID} onSuccess={onSuccess} />);
      await fillAndSubmit("test@example.com");

      await waitFor(() =>
        expect(onSuccess).toHaveBeenCalledWith(SUCCESS_INVITATION),
      );
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });
  });

  describe("C.1.2 — success without onSuccess", () => {
    it("calls toast.success and refreshes the page", async () => {
      mockInviteCollaborator.mockResolvedValue({
        kind: "success",
        invitation: SUCCESS_INVITATION,
      });

      render(<InviteByEmailForm listId={LIST_ID} />);
      await fillAndSubmit("test@example.com");

      await waitFor(() =>
        expect(mockToastSuccess).toHaveBeenCalledWith(
          expect.stringContaining("test@example.com"),
        ),
      );
      expect(mockRouterRefresh).toHaveBeenCalled();
    });
  });

  describe("C.1.3 — failure with onError provided", () => {
    it("calls onError and does NOT call toast.error", async () => {
      mockInviteCollaborator.mockResolvedValue({
        kind: "failure",
        errorMessage: "Already invited.",
      });
      const onError = vi.fn();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      render(<InviteByEmailForm listId={LIST_ID} onError={onError as any} />);
      await fillAndSubmit("test@example.com");

      await waitFor(() =>
        expect(onError).toHaveBeenCalledWith("Already invited."),
      );
      expect(mockToastError).not.toHaveBeenCalled();
    });
  });

  describe("C.1.4 — failure without onError", () => {
    it("calls toast.error with the server error message", async () => {
      mockInviteCollaborator.mockResolvedValue({
        kind: "failure",
        errorMessage: "Already invited.",
      });

      render(<InviteByEmailForm listId={LIST_ID} />);
      await fillAndSubmit("test@example.com");

      await waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith("Already invited."),
      );
    });
  });
});
