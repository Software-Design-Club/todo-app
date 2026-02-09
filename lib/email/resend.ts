import { Resend } from "resend";
import type { WebhookEventPayload } from "resend";
import { renderInvitationEmail } from "@/app/emails/invitation-email";
import type { InviteToken, List, ListInvitation } from "@/lib/types";
import { createTaggedEmailDeliveryProviderId } from "@/lib/types";

interface EmailConfig {
  apiKey: string;
  from: string;
  appBaseUrl: string;
}

export interface SendInvitationEmailParams {
  toEmail: string;
  inviterName: string;
  listTitle: List["title"];
  inviteToken: InviteToken;
  expiresAt: Date;
}

export interface SendInvitationEmailResult {
  status: "sent" | "failed";
  providerId: ListInvitation["emailDeliveryProviderId"];
  errorMessage: string | null;
}

export function verifyWebhookPayload(params: {
  payload: string;
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
  webhookSecret: string;
}): WebhookEventPayload {
  const resend = new Resend(process.env.RESEND_API_KEY?.trim());

  return resend.webhooks.verify({
    payload: params.payload,
    headers: {
      id: params.svixId,
      timestamp: params.svixTimestamp,
      signature: params.svixSignature,
    },
    webhookSecret: params.webhookSecret,
  });
}

function getEmailConfig(): EmailConfig {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const appBaseUrl = process.env.APP_BASE_URL?.trim();

  if (!apiKey || !from || !appBaseUrl) {
    throw new Error(
      "Missing required email environment variables (RESEND_API_KEY, EMAIL_FROM, APP_BASE_URL)."
    );
  }

  try {
    new URL(appBaseUrl);
  } catch {
    throw new Error("APP_BASE_URL must be a valid absolute URL.");
  }

  return { apiKey, from, appBaseUrl };
}

export function buildInvitationAcceptUrl(inviteToken: InviteToken): string {
  const { appBaseUrl } = getEmailConfig();
  const acceptUrl = new URL("/invite", appBaseUrl);
  acceptUrl.searchParams.set("token", inviteToken);
  return acceptUrl.toString();
}

export async function sendInvitationEmail(
  params: SendInvitationEmailParams
): Promise<SendInvitationEmailResult> {
  const config = getEmailConfig();
  const resend = new Resend(config.apiKey);
  const acceptUrl = buildInvitationAcceptUrl(params.inviteToken);

  const html = renderInvitationEmail({
    inviterName: params.inviterName,
    listTitle: params.listTitle,
    acceptUrl,
    expiresAt: params.expiresAt,
  });

  const response = await resend.emails.send({
    from: config.from,
    to: params.toEmail,
    subject: `You're invited to collaborate on "${params.listTitle}"`,
    html,
  });

  if (response.error) {
    return {
      status: "failed",
      providerId: null,
      errorMessage: response.error.message ?? "Failed to send invitation email.",
    };
  }

  return {
    status: "sent",
    providerId: response.data?.id
      ? createTaggedEmailDeliveryProviderId(response.data.id)
      : null,
    errorMessage: null,
  };
}
