import { Resend } from "resend";
import { Webhook } from "svix";

import { buildInvitationEmailHtml } from "@/app/emails/invitation-email";
import { verifyInvitationEnv } from "@/lib/invitations/env";
import { InvalidWebhookSignatureError } from "@/lib/invitations/errors";
import type {
  AbsoluteInvitationUrl,
  DeliveryEventType,
  EmailAddress,
  EmailServiceDeliveryEvent,
  InvitationId,
  ProviderEventReceivedAt,
  ProviderMessageId,
  ProviderRawEventType,
  ResendWebhookSecret,
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
      invitedEmail: EmailAddress;
    }): Promise<EmailServiceSendResponse> {
      const invitationEnv = verifyInvitationEnv(process.env);
      const resend = new Resend(invitationEnv.resendApiKey);
      const result = await resend.emails.send({
        from: invitationEnv.emailFrom,
        to: [input.invitedEmail],
        subject: "Todo list invitation",
        html: buildInvitationEmailHtml(input.acceptanceUrl),
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

/**
 * @contract verifyResendWebhookSignature (5.5)
 *
 * Verifies a Resend webhook signature using the svix Webhook class.
 * Returns the verified payload on success.
 * Throws InvalidWebhookSignatureError on failure.
 */
export function verifyResendWebhookSignature(input: {
  payload: string;
  headers: {
    "svix-id": string;
    "svix-timestamp": string;
    "svix-signature": string;
  };
  secret: ResendWebhookSecret;
}): unknown {
  const wh = new Webhook(input.secret);

  try {
    return wh.verify(input.payload, {
      "svix-id": input.headers["svix-id"],
      "svix-timestamp": input.headers["svix-timestamp"],
      "svix-signature": input.headers["svix-signature"],
    });
  } catch {
    throw new InvalidWebhookSignatureError();
  }
}

type ResendWebhookPayload = {
  type: string;
  data: {
    email_id?: string;
    [key: string]: unknown;
  };
  created_at: string;
};

const RESEND_EVENT_TYPE_MAP: Record<string, DeliveryEventType | "ignored"> = {
  "email.delivered": "ignored",
  "email.bounced": "bounced" as DeliveryEventType,
  "email.delivery_delayed": "delayed" as DeliveryEventType,
  "email.complained": "complained" as DeliveryEventType,
  "email.failed": "failed" as DeliveryEventType,
};

/**
 * Maps a verified Resend webhook payload to an EmailServiceDeliveryEvent.
 * Supported types: email.bounced, email.delivery_delayed, email.complained, email.failed.
 * email.delivered and unknown types are mapped to "ignored".
 */
export function mapResendEventToDeliveryEvent(
  payload: unknown,
): EmailServiceDeliveryEvent {
  const typed = payload as ResendWebhookPayload;
  const providerRawEventType = typed.type as ProviderRawEventType;
  const receivedAt = new Date(typed.created_at) as ProviderEventReceivedAt;
  const providerMessageId = (typed.data?.email_id ?? null) as ProviderMessageId | null;

  const mapped = RESEND_EVENT_TYPE_MAP[typed.type];

  if (!mapped || mapped === "ignored") {
    return {
      kind: "ignored",
      providerRawEventType,
      providerMessageId,
      receivedAt,
    };
  }

  if (!providerMessageId) {
    return {
      kind: "ignored",
      providerRawEventType,
      providerMessageId,
      receivedAt,
    };
  }

  return {
    kind: "delivery_reported",
    deliveryEventType: mapped,
    providerMessageId,
    providerRawEventType,
    receivedAt,
  };
}
