import { describe, expect, it } from "vitest";
import type { List, User } from "@/lib/types";
import {
  createOrRotateInvitation,
  listInvitationsForList,
  revokeOpenInvitationsForList,
} from "@/lib/invitations/service";
import { InMemoryInvitationRepository } from "./in-memory-repo";

describe("invitation lifecycle hooks", () => {
  it("revokes open invites for a list when lifecycle hooks trigger", async () => {
    const repo = new InMemoryInvitationRepository();
    const listId = 71 as List["id"];
    const otherListId = 72 as List["id"];
    const inviterId = 5 as User["id"];

    await createOrRotateInvitation(
      { listId, inviterId, invitedEmail: "one@example.com" },
      repo
    );
    await createOrRotateInvitation(
      { listId: otherListId, inviterId, invitedEmail: "two@example.com" },
      repo
    );

    await revokeOpenInvitationsForList({ listId }, repo);

    const [primaryListInvites, secondaryListInvites] = await Promise.all([
      listInvitationsForList({ listId }, repo),
      listInvitationsForList({ listId: otherListId }, repo),
    ]);

    expect(primaryListInvites.every((invite) => invite.inviteStatus === "revoked")).toBe(
      true
    );
    expect(secondaryListInvites.every((invite) => invite.inviteStatus === "sent")).toBe(
      true
    );
  });
});
