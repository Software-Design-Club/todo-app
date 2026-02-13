import { describe, expect, it } from "vitest";
import {
  createTaggedEmailDeliveryProviderId,
  createTaggedListId,
  createTaggedUserId,
} from "@/lib/types";
import {
  approvePendingOwnerInvitation,
  consumeInvitationToken,
  createOrRotateInvitation,
  rejectPendingOwnerInvitation,
  resendInvitation,
  revokeInvitation,
  updateInvitationEmailDeliveryStatus,
} from "@/lib/invitations/service";
import { InMemoryInvitationRepository } from "./in-memory-repo";

describe("invitation service integration", () => {
  it("reuses open rows and rotates tokens for duplicate open invite attempts", async () => {
    const repo = new InMemoryInvitationRepository();
    const listId = createTaggedListId(11);
    const inviterId = createTaggedUserId(7);

    const firstInvite = await createOrRotateInvitation(
      { listId, inviterId, invitedEmail: "friend@example.com" },
      repo
    );
    const secondInvite = await createOrRotateInvitation(
      { listId, inviterId, invitedEmail: "friend@example.com" },
      repo
    );

    expect(secondInvite.reusedExistingRow).toBe(true);
    expect(secondInvite.invitation.id).toBe(firstInvite.invitation.id);
    expect(secondInvite.inviteToken).not.toBe(firstInvite.inviteToken);
  });

  it("rejects duplicate concurrent createOrRotateInvitation calls with one persisted row", async () => {
    const repo = new InMemoryInvitationRepository();
    const listId = createTaggedListId(15);
    const inviterId = createTaggedUserId(5);

    const [first, second] = await Promise.all([
      createOrRotateInvitation(
        { listId, inviterId, invitedEmail: "parallel@example.com" },
        repo
      ),
      createOrRotateInvitation(
        { listId, inviterId, invitedEmail: "parallel@example.com" },
        repo
      ),
    ]);

    expect(first.invitation.id).toBe(second.invitation.id);
  });

  it("enforces revoke transition against non-open states", async () => {
    const repo = new InMemoryInvitationRepository();
    const listId = createTaggedListId(22);
    const inviterId = createTaggedUserId(8);

    const created = await createOrRotateInvitation(
      { listId, inviterId, invitedEmail: "member@example.com" },
      repo
    );

    const revoked = await revokeInvitation(
      { invitationId: created.invitation.id, listId },
      repo
    );
    expect(revoked.inviteStatus).toBe("revoked");

    await expect(
      revokeInvitation({ invitationId: created.invitation.id, listId }, repo)
    ).rejects.toThrow("Only open invitations can be revoked.");
  });

  it("prevents resending invitations that are not open", async () => {
    const repo = new InMemoryInvitationRepository();
    const listId = createTaggedListId(25);
    const inviterId = createTaggedUserId(3);

    const created = await createOrRotateInvitation(
      { listId, inviterId, invitedEmail: "blocked@example.com" },
      repo
    );

    await revokeInvitation(
      { invitationId: created.invitation.id, listId },
      repo
    );

    await expect(
      resendInvitation(
        { invitationId: created.invitation.id, listId, inviterId },
        repo
      )
    ).rejects.toThrow("Only open invitations can be resent.");
  });

  it("prevents resending accepted invitations", async () => {
    const repo = new InMemoryInvitationRepository();
    const listId = createTaggedListId(26);
    const inviterId = createTaggedUserId(4);

    const created = await createOrRotateInvitation(
      { listId, inviterId, invitedEmail: "accepted@example.com" },
      repo
    );

    await consumeInvitationToken(
      {
        inviteToken: created.inviteToken,
        userId: createTaggedUserId(99),
        userEmail: "accepted@example.com",
      },
      repo
    );

    await expect(
      resendInvitation(
        { invitationId: created.invitation.id, listId, inviterId },
        repo
      )
    ).rejects.toThrow("Only open invitations can be resent.");
  });

  it("guards against re-inviting an already accepted collaborator email", async () => {
    const repo = new InMemoryInvitationRepository();
    const listId = createTaggedListId(28);
    const inviterId = createTaggedUserId(12);

    await repo.createInvitation({
      listId,
      userId: createTaggedUserId(40),
      invitedEmailNormalized: "member@example.com",
      inviterId,
      role: "collaborator",
      inviteStatus: "accepted",
      inviteAcceptedAt: new Date(),
    });

    await expect(
      createOrRotateInvitation(
        { listId, inviterId, invitedEmail: "member@example.com" },
        repo
      )
    ).rejects.toThrow(
      "This email is already an accepted collaborator on this list."
    );
  });

  it("supports pending-approval approve/reject transitions", async () => {
    const repo = new InMemoryInvitationRepository();
    const listId = createTaggedListId(33);
    const inviterId = createTaggedUserId(9);
    const ownerId = createTaggedUserId(10);

    const created = await createOrRotateInvitation(
      { listId, inviterId, invitedEmail: "expected@example.com" },
      repo
    );

    const consumed = await consumeInvitationToken(
      {
        inviteToken: created.inviteToken,
        userId: createTaggedUserId(99),
        userEmail: "different@example.com",
      },
      repo
    );
    expect(consumed.status).toBe("pending_approval_now");

    const approved = await approvePendingOwnerInvitation(
      {
        invitationId: created.invitation.id,
        listId,
        ownerId,
      },
      repo
    );
    expect(approved.inviteStatus).toBe("accepted");

    await expect(
      rejectPendingOwnerInvitation(
        {
          invitationId: created.invitation.id,
          listId,
          ownerId,
        },
        repo
      )
    ).rejects.toThrow("Invitation is not pending owner approval.");
  });

  it("keeps provider id when updating email delivery by provider lookup", async () => {
    const repo = new InMemoryInvitationRepository();
    const listId = createTaggedListId(41);
    const inviterId = createTaggedUserId(12);
    const providerId = createTaggedEmailDeliveryProviderId("provider-msg-99");

    await repo.createInvitation({
      listId,
      userId: null,
      inviterId,
      role: "collaborator",
      inviteStatus: "sent",
      invitedEmailNormalized: "webhook@example.com",
      emailDeliveryProviderId: providerId,
    });

    const updated = await updateInvitationEmailDeliveryStatus(
      {
        providerId,
        status: "failed",
        errorMessage: "Mailbox unavailable",
        repo,
      }
    );

    expect(updated).not.toBeNull();
    expect(updated?.emailDeliveryProviderId).toBe(providerId);
    expect(updated?.emailDeliveryStatus).toBe("failed");
    expect(updated?.emailDeliveryError).toBe("Mailbox unavailable");
  });
});
