"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { UsersTable } from "@/drizzle/schema";
import type {
  InvitationStatus,
  List,
  ListInvitation,
  ListUser,
  User,
} from "@/lib/types";
import { createTaggedInviteToken } from "@/lib/types";
import { getList } from "@/app/lists/_actions/list";
import { getCollaborators } from "@/app/lists/_actions/collaborators";
import { buildInvitationAcceptUrl, sendInvitationEmail } from "@/lib/email/resend";
import {
  approvePendingOwnerInvitation,
  consumeInvitationToken,
  createOrRotateInvitation,
  getInvitationByIdForList,
  listInvitationsForList,
  updateInvitationEmailDeliveryStatus,
  rejectPendingOwnerInvitation,
  resendInvitation,
  revokeInvitation,
} from "@/lib/invitations/service";
import { checkRateLimit } from "@/lib/rate-limit";
import { isValidEmail } from "@/lib/validation";
import { isAuthorizedToEditCollaborators } from "./permissions";
import { requireAuth } from "./require-auth";

function isOwnerAuthorizedForInvitationActions(
  collaborators: ListUser[],
  userId: User["id"]
): boolean {
  return isAuthorizedToEditCollaborators(collaborators, userId);
}

async function assertOwnerAccess(listId: List["id"]) {
  const { user } = await requireAuth();
  const collaborators = await getCollaborators(listId);
  if (!isOwnerAuthorizedForInvitationActions(collaborators, user.id)) {
    throw new Error("Only the list owner can manage invitations.");
  }
  return user;
}

async function getInviterName(inviterId: User["id"]): Promise<string> {
  const db = drizzle(sql);
  const [user] = await db
    .select({
      name: UsersTable.name,
    })
    .from(UsersTable)
    .where(eq(UsersTable.id, inviterId))
    .limit(1);

  return user?.name ?? "A collaborator";
}

export async function createInvitationForList(params: {
  listId: List["id"];
  invitedEmail: string;
}) {
  const trimmedEmail = params.invitedEmail.trim();
  if (!isValidEmail(trimmedEmail)) {
    throw new Error("Please enter a valid email address.");
  }

  const user = await assertOwnerAccess(params.listId);
  const { allowed } = checkRateLimit({
    key: `invite:${user.id}`,
    limit: 10,
    windowMs: 60_000,
  });
  if (!allowed) {
    throw new Error("Too many invitations. Please wait before trying again.");
  }

  const list = await getList(params.listId);
  const inviterName = await getInviterName(user.id);

  const { invitation, inviteToken } = await createOrRotateInvitation({
    listId: params.listId,
    inviterId: user.id,
    invitedEmail: trimmedEmail,
  });

  const emailDelivery = await sendInvitationEmail({
    toEmail: trimmedEmail.toLowerCase(),
    inviterName,
    listTitle: list.title,
    inviteToken,
    expiresAt: invitation.inviteExpiresAt ?? new Date(),
  });

  const updatedInvitation = await updateInvitationEmailDeliveryStatus({
    invitationId: invitation.id,
    providerId: emailDelivery.providerId,
    status: emailDelivery.status,
    errorMessage: emailDelivery.errorMessage,
  });

  revalidatePath(`/lists/${params.listId}`);

  return {
    invitation: updatedInvitation ?? invitation,
    inviteLink: buildInvitationAcceptUrl(inviteToken),
  };
}

export async function resendInvitationForList(params: {
  invitationId: ListInvitation["id"];
  listId: List["id"];
}) {
  const user = await assertOwnerAccess(params.listId);
  const { allowed } = checkRateLimit({
    key: `invite:${user.id}`,
    limit: 10,
    windowMs: 60_000,
  });
  if (!allowed) {
    throw new Error("Too many invitations. Please wait before trying again.");
  }

  const list = await getList(params.listId);
  const inviterName = await getInviterName(user.id);

  const { invitation, inviteToken } = await resendInvitation({
    invitationId: params.invitationId,
    listId: params.listId,
    inviterId: user.id,
  });

  const recipientEmail = invitation.invitedEmailNormalized;
  if (!recipientEmail) {
    throw new Error("Cannot resend invitation without a recipient email.");
  }

  const emailDelivery = await sendInvitationEmail({
    toEmail: recipientEmail,
    inviterName,
    listTitle: list.title,
    inviteToken,
    expiresAt: invitation.inviteExpiresAt ?? new Date(),
  });

  const updatedInvitation = await updateInvitationEmailDeliveryStatus({
    invitationId: invitation.id,
    providerId: emailDelivery.providerId,
    status: emailDelivery.status,
    errorMessage: emailDelivery.errorMessage,
  });

  revalidatePath(`/lists/${params.listId}`);

  return {
    invitation: updatedInvitation ?? invitation,
    inviteLink: buildInvitationAcceptUrl(inviteToken),
  };
}

export async function revokeInvitationForList(params: {
  invitationId: ListInvitation["id"];
  listId: List["id"];
}) {
  await assertOwnerAccess(params.listId);

  const invitation = await revokeInvitation({
    invitationId: params.invitationId,
    listId: params.listId,
  });

  revalidatePath(`/lists/${params.listId}`);
  return invitation;
}

export async function approveInvitationForList(params: {
  invitationId: ListInvitation["id"];
  listId: List["id"];
}) {
  const user = await assertOwnerAccess(params.listId);

  const invitation = await approvePendingOwnerInvitation({
    invitationId: params.invitationId,
    listId: params.listId,
    ownerId: user.id,
  });

  revalidatePath(`/lists/${params.listId}`);
  return invitation;
}

export async function rejectInvitationForList(params: {
  invitationId: ListInvitation["id"];
  listId: List["id"];
}) {
  const user = await assertOwnerAccess(params.listId);

  const invitation = await rejectPendingOwnerInvitation({
    invitationId: params.invitationId,
    listId: params.listId,
    ownerId: user.id,
  });

  revalidatePath(`/lists/${params.listId}`);
  return invitation;
}

export async function getInvitationsForList(params: {
  listId: List["id"];
  statuses?: InvitationStatus[];
}) {
  await assertOwnerAccess(params.listId);
  return listInvitationsForList({
    listId: params.listId,
    statuses: params.statuses,
  });
}

export async function getInvitationForList(params: {
  invitationId: ListInvitation["id"];
  listId: List["id"];
}) {
  await assertOwnerAccess(params.listId);
  return getInvitationByIdForList({
    invitationId: params.invitationId,
    listId: params.listId,
  });
}

export async function acceptInvitationToken(params: {
  inviteToken: string;
}) {
  const { user } = await requireAuth();

  return consumeInvitationToken({
    inviteToken: createTaggedInviteToken(params.inviteToken),
    userId: user.id,
    userEmail: user.email,
  });
}
