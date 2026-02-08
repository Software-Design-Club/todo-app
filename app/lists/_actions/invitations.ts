"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { UsersTable } from "@/drizzle/schema";
import type { InvitationStatus, List, ListInvitation, User } from "@/lib/types";
import { getList } from "@/app/lists/_actions/list";
import { getCollaborators } from "@/app/lists/_actions/collaborators";
import { isListOwner } from "@/app/lists/_actions/permissions";
import { sendInvitationEmail } from "@/lib/email/resend";
import {
  approvePendingOwnerInvitation,
  consumeInvitationToken,
  createOrRotateInvitation,
  getInvitationByIdForList,
  listInvitationsForList,
  markInvitationEmailDelivery,
  rejectPendingOwnerInvitation,
  resendInvitation,
  revokeInvitation,
} from "@/lib/invitations/service";

async function assertOwnerAccess(listId: List["id"], userId: User["id"]) {
  const collaborators = await getCollaborators(listId);
  if (!isListOwner(collaborators, userId)) {
    throw new Error("Only the list owner can manage invitations.");
  }
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
  ownerUserId: User["id"];
  invitedEmail: string;
}) {
  await assertOwnerAccess(params.listId, params.ownerUserId);
  const list = await getList(params.listId);
  const inviterName = await getInviterName(params.ownerUserId);

  const { invitation, inviteToken } = await createOrRotateInvitation({
    listId: params.listId,
    inviterId: params.ownerUserId,
    invitedEmail: params.invitedEmail,
  });

  const emailDelivery = await sendInvitationEmail({
    toEmail: params.invitedEmail.trim().toLowerCase(),
    inviterName,
    listTitle: list.title,
    inviteToken,
    expiresAt: invitation.inviteExpiresAt ?? new Date(),
  });

  const updatedInvitation = await markInvitationEmailDelivery({
    invitationId: invitation.id,
    status: emailDelivery.status,
    providerId: emailDelivery.providerId,
    errorMessage: emailDelivery.errorMessage,
  });

  revalidatePath(`/lists/${params.listId}`);

  return updatedInvitation;
}

export async function resendInvitationForList(params: {
  invitationId: ListInvitation["id"];
  listId: List["id"];
  ownerUserId: User["id"];
}) {
  await assertOwnerAccess(params.listId, params.ownerUserId);
  const list = await getList(params.listId);
  const inviterName = await getInviterName(params.ownerUserId);

  const { invitation, inviteToken } = await resendInvitation({
    invitationId: params.invitationId,
    listId: params.listId,
    inviterId: params.ownerUserId,
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

  const updatedInvitation = await markInvitationEmailDelivery({
    invitationId: invitation.id,
    status: emailDelivery.status,
    providerId: emailDelivery.providerId,
    errorMessage: emailDelivery.errorMessage,
  });

  revalidatePath(`/lists/${params.listId}`);

  return updatedInvitation;
}

export async function revokeInvitationForList(params: {
  invitationId: ListInvitation["id"];
  listId: List["id"];
  ownerUserId: User["id"];
}) {
  await assertOwnerAccess(params.listId, params.ownerUserId);

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
  ownerUserId: User["id"];
}) {
  await assertOwnerAccess(params.listId, params.ownerUserId);

  const invitation = await approvePendingOwnerInvitation({
    invitationId: params.invitationId,
    listId: params.listId,
    ownerId: params.ownerUserId,
  });

  revalidatePath(`/lists/${params.listId}`);
  return invitation;
}

export async function rejectInvitationForList(params: {
  invitationId: ListInvitation["id"];
  listId: List["id"];
  ownerUserId: User["id"];
}) {
  await assertOwnerAccess(params.listId, params.ownerUserId);

  const invitation = await rejectPendingOwnerInvitation({
    invitationId: params.invitationId,
    listId: params.listId,
    ownerId: params.ownerUserId,
  });

  revalidatePath(`/lists/${params.listId}`);
  return invitation;
}

export async function getInvitationsForList(params: {
  listId: List["id"];
  ownerUserId: User["id"];
  statuses?: InvitationStatus[];
}) {
  await assertOwnerAccess(params.listId, params.ownerUserId);
  return listInvitationsForList({
    listId: params.listId,
    statuses: params.statuses,
  });
}

export async function getInvitationForList(params: {
  invitationId: ListInvitation["id"];
  listId: List["id"];
  ownerUserId: User["id"];
}) {
  await assertOwnerAccess(params.listId, params.ownerUserId);
  return getInvitationByIdForList({
    invitationId: params.invitationId,
    listId: params.listId,
  });
}

export async function acceptInvitationToken(params: {
  inviteToken: string;
  userId: User["id"];
  userEmail: string;
}) {
  return consumeInvitationToken(params);
}
