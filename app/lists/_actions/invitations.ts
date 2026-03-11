"use server";

import { inviteCollaboratorWorkflow } from "@/lib/invitations/service";
import type { EmailAddress, List, User } from "@/lib/types";

/**
 * @contract inviteCollaborator
 *
 * Server-action wrapper around the invitation issuing workflow.
 */
export async function inviteCollaborator(input: {
  listId: List["id"];
  inviterId: User["id"];
  invitedEmail: EmailAddress;
  now?: Date;
}) {
  return inviteCollaboratorWorkflow({
    ...input,
    now: input.now ?? new Date(),
  });
}
