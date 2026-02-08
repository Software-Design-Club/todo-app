import { Resend } from "resend";
import { createHmac, timingSafeEqual } from "node:crypto";
import { renderInvitationEmail } from "@/app/emails/invitation-email";

interface EmailConfig {
  apiKey: string;
  from: string;
  appBaseUrl: string;
}

export interface SendInvitationEmailParams {
  toEmail: string;
  inviterName: string;
  listTitle: string;
  inviteToken: string;
  expiresAt: Date;
}

export interface SendInvitationEmailResult {
  status: "sent" | "failed";
  providerId: string | null;
  errorMessage: string | null;
}

export function verifyResendWebhookSignature(params: {
  payload: string;
  signature: string;
  secret: string;
}): boolean {
  const expectedSignature = createHmac("sha256", params.secret)
    .update(params.payload)
    .digest("hex");

  const provided = Buffer.from(params.signature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");

  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(provided, expected);
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

export function buildInvitationAcceptUrl(inviteToken: string): string {
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
    providerId: response.data?.id ?? null,
    errorMessage: null,
  };
}
