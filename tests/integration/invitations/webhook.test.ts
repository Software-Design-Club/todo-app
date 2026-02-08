import { describe, expect, it } from "vitest";
import type { List, User } from "@/lib/types";
import {
  createOrRotateInvitation,
  listInvitationsForList,
  markInvitationEmailDelivery,
  markInvitationEmailDeliveryByProviderId,
} from "@/lib/invitations/service";
import { InMemoryInvitationRepository } from "./in-memory-repo";

describe("resend webhook persistence", () => {
  it("persists failure metadata by provider message id", async () => {
    const repo = new InMemoryInvitationRepository();
    const listId = 88 as List["id"];
    const inviterId = 8 as User["id"];

    const created = await createOrRotateInvitation(
      { listId, inviterId, invitedEmail: "webhook@example.com" },
      repo
    );

    await markInvitationEmailDelivery(
      {
        invitationId: created.invitation.id,
        status: "sent",
        providerId: "provider-msg-1",
        errorMessage: null,
      },
      repo
    );

    const updated = await markInvitationEmailDeliveryByProviderId(
      {
        providerId: "provider-msg-1",
        status: "failed",
        errorMessage: "email.bounced",
      },
      repo
    );

    expect(updated?.emailDeliveryStatus).toBe("failed");
    expect(updated?.emailDeliveryError).toBe("email.bounced");

    const [invite] = await listInvitationsForList({ listId }, repo);
    expect(invite.emailDeliveryStatus).toBe("failed");
  });
});
