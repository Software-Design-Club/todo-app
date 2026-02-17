import { CollaboratorRoleEnum, InvitationStatusEnum } from "@/drizzle/schema";

export const INVITATION_STATUS = {
  SENT: InvitationStatusEnum.enumValues[0],
  ACCEPTED: InvitationStatusEnum.enumValues[1],
  PENDING_APPROVAL: InvitationStatusEnum.enumValues[2],
  REVOKED: InvitationStatusEnum.enumValues[3],
  EXPIRED: InvitationStatusEnum.enumValues[4],
} as const;

export const COLLABORATOR_ROLE = {
  OWNER: CollaboratorRoleEnum.enumValues[0],
  COLLABORATOR: CollaboratorRoleEnum.enumValues[1],
} as const;
