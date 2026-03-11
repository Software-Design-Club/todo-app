import { Resend } from "resend";
import { renderToStaticMarkup } from "react-dom/server";

import { InvitationEmail } from "@/app/emails/invitation-email";
import { verifyInvitationEnv } from "@/lib/invitations/env";
import type {
  AbsoluteInvitationUrl,
  InvitationId,
  ProviderMessageId,
} from "@/lib/types";

import type { EmailService, EmailServiceSendResponse } from "./service";

/**
 * @module resend email delivery contract
 *
 * Maps Resend-specific invitation delivery behavior into the generic
 * EmailService response shape consumed by invitation-domain code.
 */

export function createResendEmailService(): EmailService {
  return {
    async sendInvitationEmail(input: {
      invitationId: InvitationId;
      acceptanceUrl: AbsoluteInvitationUrl;
    }): Promise<EmailServiceSendResponse> {
      const invitationEnv = verifyInvitationEnv(process.env);
      const resend = new Resend(invitationEnv.resendApiKey);
      const result = await resend.emails.send({
        from: invitationEnv.emailFrom,
        to: [invitationEnv.emailFrom],
        subject: "Todo list invitation",
        html: renderToStaticMarkup(
          InvitationEmail({ acceptanceUrl: input.acceptanceUrl }),
        ),
        headers: {
          "X-Todo-Invitation-Id": String(input.invitationId),
        },
      });

      if (result.error) {
        return {
          kind: "rejected",
          errorMessage: result.error.message as never,
          errorName: result.error.name as never,
        };
      }

      return {
        kind: "accepted",
        providerMessageId: result.data?.id as ProviderMessageId,
      };
    },
  };
}
