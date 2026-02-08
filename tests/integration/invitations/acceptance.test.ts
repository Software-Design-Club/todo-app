import { describe, expect, it } from "vitest";
import type { List, User } from "@/lib/types";
import { getInvitationAcceptanceUiState } from "@/lib/invitations/acceptance";
import { buildSignInRedirectForInvite } from "@/lib/invitations/redirect";
import {
  consumeInvitationToken,
  createOrRotateInvitation,
} from "@/lib/invitations/service";
import { InMemoryInvitationRepository } from "./in-memory-repo";

describe("invitation acceptance flow", () => {
  it("builds redirect-to-sign-in continuation URLs", () => {
    const url = buildSignInRedirectForInvite("abc+token");
    expect(url).toContain("/sign-in?redirectTo=");
    expect(url).toContain(
      encodeURIComponent("/invite?token=abc%2Btoken")
    );
  });

  it("accepts invite when signed-in email matches invited email", async () => {
    const repo = new InMemoryInvitationRepository();
    const created = await createOrRotateInvitation(
      {
        listId: 42 as List["id"],
        inviterId: 1 as User["id"],
        invitedEmail: "match@example.com",
      },
      repo
    );

    const consumed = await consumeInvitationToken(
      {
        inviteToken: created.inviteToken,
        userId: 99 as User["id"],
        userEmail: "match@example.com",
      },
      repo
    );

    expect(consumed.status).toBe("accepted_now");
    if (consumed.status === "accepted_now") {
      expect(consumed.invitation.userId).toBe(99);
      expect(consumed.invitation.inviteStatus).toBe("accepted");
    }
  });

  it("maps service outcomes into explicit UI states", () => {
    const state = getInvitationAcceptanceUiState({
      status: "invalid",
    });
    expect(state.title).toBe("Invalid invitation");
    expect(state.listId).toBeNull();
  });
});
