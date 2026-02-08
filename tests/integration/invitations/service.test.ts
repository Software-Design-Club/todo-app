import { describe, expect, it } from "vitest";
import type { List, User } from "@/lib/types";
import {
  approvePendingOwnerInvitation,
  consumeInvitationToken,
  createOrRotateInvitation,
  rejectPendingOwnerInvitation,
  revokeInvitation,
} from "@/lib/invitations/service";
import { InMemoryInvitationRepository } from "./in-memory-repo";

describe("invitation service integration", () => {
  it("reuses open rows and rotates tokens for duplicate open invite attempts", async () => {
    const repo = new InMemoryInvitationRepository();
    const listId = 11 as List["id"];
    const inviterId = 7 as User["id"];

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

  it("enforces revoke transition against non-open states", async () => {
    const repo = new InMemoryInvitationRepository();
    const listId = 22 as List["id"];
    const inviterId = 8 as User["id"];

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

  it("supports pending-owner-approval approve/reject transitions", async () => {
    const repo = new InMemoryInvitationRepository();
    const listId = 33 as List["id"];
    const inviterId = 9 as User["id"];
    const ownerId = 10 as User["id"];

    const created = await createOrRotateInvitation(
      { listId, inviterId, invitedEmail: "expected@example.com" },
      repo
    );

    const consumed = await consumeInvitationToken(
      {
        inviteToken: created.inviteToken,
        userId: 99 as User["id"],
        userEmail: "different@example.com",
      },
      repo
    );
    expect(consumed.status).toBe("pending_owner_approval_now");

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
});
