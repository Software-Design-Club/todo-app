import { createResendEmailService } from "@/lib/email/resend";
import { createTestStubEmailService } from "@/lib/email/test-stub";
import { verifyInvitationEnv } from "@/lib/invitations/env";
import type {
  AbsoluteInvitationUrl,
  EmailAddress,
  EmailServiceErrorMessage,
  EmailServiceErrorName,
  InvitationId,
  ProviderMessageId,
} from "@/lib/types";

export type EmailServiceAcceptedSendResponse = {
  kind: "accepted";
  providerMessageId: ProviderMessageId;
};

export type EmailServiceRejectedSendResponse = {
  kind: "rejected";
  errorMessage: EmailServiceErrorMessage;
  errorName?: EmailServiceErrorName;
};

export type EmailServiceSendResponse =
  | EmailServiceAcceptedSendResponse
  | EmailServiceRejectedSendResponse;

export type EmailService = {
  sendInvitationEmail(input: {
    invitationId: InvitationId;
    acceptanceUrl: AbsoluteInvitationUrl;
    invitedEmail: EmailAddress;
  }): Promise<EmailServiceSendResponse>;
};

let emailServiceOverride: EmailService | null = null;

function resolveEmailService(): EmailService {
  if (emailServiceOverride) {
    return emailServiceOverride;
  }

  if (
    process.env.NODE_ENV === "test" ||
    process.env.INVITATION_EMAIL_SERVICE === "test-stub"
  ) {
    return createTestStubEmailService();
  }

  return createResendEmailService();
}

export function setEmailServiceForTesting(service: EmailService | null) {
  emailServiceOverride = service;
}

/**
 * @contract sendInvitationEmail
 *
 * Validates required email configuration before attempting provider delivery.
 * Delegates to the configured `EmailService` implementation.
 * Attempts exactly one service send per invocation.
 * Production uses a Resend-backed `EmailService`, which maps provider-specific
 * send responses into `EmailServiceSendResponse` before returning.
 * E2E uses a test-stub `EmailService` that captures invitation deliveries for
 * deterministic browser tests without depending on live provider delivery.
 * Returns the generic `EmailServiceSendResponse`; downstream invitation code
 * does not depend on provider-specific response shapes.
 */
export async function sendInvitationEmail(input: {
  invitationId: InvitationId;
  acceptanceUrl: AbsoluteInvitationUrl;
  invitedEmail: EmailAddress;
}): Promise<EmailServiceSendResponse> {
  verifyInvitationEnv(process.env);

  const emailService = resolveEmailService();
  return emailService.sendInvitationEmail(input);
}
