import { describe, expect, it } from "vitest";
import type {
  ActorCollaboratorCapabilities,
  InvitationExpiry,
  InvitationId,
  ListId,
  NormalizedEmailAddress,
  PendingApprovalInvitationSummary,
  SentInvitationSummary,
  UserId,
} from "@/lib/types";

const FULL_CAPABILITIES: ActorCollaboratorCapabilities = {
  canResend: true,
  canRevoke: true,
  canCopyLink: true,
  canApprove: true,
  canReject: true,
};

const NO_CAPABILITIES: ActorCollaboratorCapabilities = {
  canResend: false,
  canRevoke: false,
  canCopyLink: false,
  canApprove: false,
  canReject: false,
};

const SENT_INVITATION: SentInvitationSummary = {
  kind: "sent",
  invitationId: 1 as InvitationId,
  listId: 10 as ListId,
  invitedEmailNormalized: "user@example.com" as NormalizedEmailAddress,
  expiresAt: new Date("2026-03-18") as InvitationExpiry,
};

const PENDING_APPROVAL_INVITATION: PendingApprovalInvitationSummary = {
  kind: "pending_approval",
  invitationId: 2 as InvitationId,
  listId: 10 as ListId,
  invitedEmailNormalized: "user@example.com" as NormalizedEmailAddress,
  expiresAt: new Date("2026-03-18") as InvitationExpiry,
  acceptedByUserId: 99 as UserId,
  acceptedByEmail: "other@example.com" as NormalizedEmailAddress,
};

describe("getAvailableInvitationActions (Contract 8.4)", () => {
  describe("sent invitation with full capabilities", () => {
    it("returns resend, revoke, and copy_link actions", async () => {
      const { getAvailableInvitationActions } = await import(
        "../../../lib/invitations/service"
      );

      const actions = getAvailableInvitationActions({
        invitation: SENT_INVITATION,
        actorCapabilities: FULL_CAPABILITIES,
      });

      expect(actions).toHaveLength(3);
      expect(actions.map((a) => a.kind)).toEqual(
        expect.arrayContaining(["resend", "revoke", "copy_link"]),
      );
      actions.forEach((action) => {
        expect(action.invitationId).toBe(SENT_INVITATION.invitationId);
      });
    });
  });

  describe("pending_approval invitation with full capabilities", () => {
    it("returns approve and reject actions", async () => {
      const { getAvailableInvitationActions } = await import(
        "../../../lib/invitations/service"
      );

      const actions = getAvailableInvitationActions({
        invitation: PENDING_APPROVAL_INVITATION,
        actorCapabilities: FULL_CAPABILITIES,
      });

      expect(actions).toHaveLength(2);
      expect(actions.map((a) => a.kind)).toEqual(
        expect.arrayContaining(["approve", "reject"]),
      );
      actions.forEach((action) => {
        expect(action.invitationId).toBe(PENDING_APPROVAL_INVITATION.invitationId);
      });
    });
  });

  describe("sent invitation with no capabilities", () => {
    it("returns empty array", async () => {
      const { getAvailableInvitationActions } = await import(
        "../../../lib/invitations/service"
      );

      const actions = getAvailableInvitationActions({
        invitation: SENT_INVITATION,
        actorCapabilities: NO_CAPABILITIES,
      });

      expect(actions).toHaveLength(0);
    });
  });

  describe("pending_approval invitation with only canReject capability", () => {
    it("returns only reject action", async () => {
      const { getAvailableInvitationActions } = await import(
        "../../../lib/invitations/service"
      );

      const actions = getAvailableInvitationActions({
        invitation: PENDING_APPROVAL_INVITATION,
        actorCapabilities: {
          ...NO_CAPABILITIES,
          canReject: true,
        },
      });

      expect(actions).toHaveLength(1);
      expect(actions[0]!.kind).toBe("reject");
    });
  });

  describe("pending_approval invitation with no approve capability", () => {
    it("returns only reject action when canReject is set", async () => {
      const { getAvailableInvitationActions } = await import(
        "../../../lib/invitations/service"
      );

      const actions = getAvailableInvitationActions({
        invitation: PENDING_APPROVAL_INVITATION,
        actorCapabilities: {
          ...FULL_CAPABILITIES,
          canApprove: false,
        },
      });

      expect(actions).toHaveLength(1);
      expect(actions[0]!.kind).toBe("reject");
    });
  });

  describe("sent invitation with partial capabilities", () => {
    it("returns only actions where actor has capability", async () => {
      const { getAvailableInvitationActions } = await import(
        "../../../lib/invitations/service"
      );

      const actions = getAvailableInvitationActions({
        invitation: SENT_INVITATION,
        actorCapabilities: {
          ...NO_CAPABILITIES,
          canResend: true,
        },
      });

      expect(actions).toHaveLength(1);
      expect(actions[0]!.kind).toBe("resend");
    });
  });
});
