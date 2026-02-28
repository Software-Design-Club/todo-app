import { NextRequest, NextResponse } from "next/server";
import type { WebhookEventPayload } from "resend";
import { verifyWebhookPayload } from "@/lib/email/resend";
import { updateInvitationEmailDeliveryStatus } from "@/lib/invitations/service";
import { createTaggedEmailDeliveryProviderId } from "@/lib/types";

const FAILURE_EVENT_TYPES = new Set([
  "email.bounced",
  "email.complained",
  "email.delivery_delayed",
  "email.failed",
]);

const EVENT_DESCRIPTIONS: Record<string, string> = {
  "email.bounced": "Email bounced - recipient address invalid.",
  "email.complained": "Email marked as spam by recipient.",
  "email.delivery_delayed": "Email delivery delayed.",
  "email.failed": "Email delivery failed.",
};

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Webhook secret not configured." },
      { status: 503 }
    );
  }

  const rawPayload = await request.text();
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: "Missing webhook signature headers." },
      { status: 401 }
    );
  }

  let payload: WebhookEventPayload;
  try {
    payload = verifyWebhookPayload({
      payload: rawPayload,
      svixId,
      svixTimestamp,
      svixSignature,
      webhookSecret,
    });
  } catch (error) {
    console.error("Webhook verification failed:", error);
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  if (!FAILURE_EVENT_TYPES.has(payload.type)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const data = payload.data;
  const providerId = "email_id" in data ? data.email_id : undefined;

  if (!providerId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const errorMessage =
    ("reason" in data ? (data.reason as string) : undefined) ??
    EVENT_DESCRIPTIONS[payload.type] ??
    payload.type;

  await updateInvitationEmailDeliveryStatus({
    providerId: createTaggedEmailDeliveryProviderId(providerId),
    status: "failed",
    errorMessage,
  });

  return NextResponse.json({ ok: true });
}
