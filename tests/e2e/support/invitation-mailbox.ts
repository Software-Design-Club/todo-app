import {
  listStubInvitationDeliveries,
  resetStubInvitationMailbox,
} from "@/lib/email/test-stub";

export async function readInvitationMailbox() {
  return listStubInvitationDeliveries();
}

export async function clearInvitationMailbox() {
  await resetStubInvitationMailbox();
}
