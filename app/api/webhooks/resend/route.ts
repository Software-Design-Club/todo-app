import { NextRequest, NextResponse } from "next/server";
import { verifyResendWebhookSignature } from "@/lib/email/resend";
import { markInvitationEmailDeliveryByProviderId } from "@/lib/invitations/service";

const FAILURE_EVENT_TYPES = new Set([
  "email.bounced",
  "email.complained",
  "email.delivery_delayed",
  "email.failed",
]);

export async function POST(request: NextRequest) {
  const rawPayload = await request.text();
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();

  if (webhookSecret) {
    const signatureHeader = request.headers.get("x-resend-signature");
    if (!signatureHeader) {
      return NextResponse.json(
        { error: "Missing webhook signature." },
        { status: 401 }
      );
    }

    const isValid = verifyResendWebhookSignature({
      payload: rawPayload,
      signature: signatureHeader,
      secret: webhookSecret,
    });

    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawPayload) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const eventType = String(payload.type ?? "");
  if (!FAILURE_EVENT_TYPES.has(eventType)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const data = (payload.data ?? {}) as Record<string, unknown>;
  const providerId =
    (data.email_id as string | undefined) ??
    (data.emailId as string | undefined) ??
    (data.id as string | undefined);

  if (!providerId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const errorMessage =
    (data.reason as string | undefined) ??
    (data.error as string | undefined) ??
    eventType;

  await markInvitationEmailDeliveryByProviderId({
    providerId,
    status: "failed",
    errorMessage,
  });

  return NextResponse.json({ ok: true });
}
