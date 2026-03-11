import { NextResponse } from "next/server";

import {
  verifyResendWebhookSignature,
  mapResendEventToDeliveryEvent,
} from "@/lib/email/resend";
import { InvalidWebhookSignatureError } from "@/lib/invitations/errors";
import { verifyInvitationEnv } from "@/lib/invitations/env";
import { handleAuthenticatedEmailProviderEventWorkflow } from "@/lib/invitations/service";
import type { ResendWebhookSecret } from "@/lib/types";

export async function POST(request: Request) {
  let rawBody: string;

  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(
      { error: "Unable to read request body" },
      { status: 400 },
    );
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: "Missing required webhook signature headers" },
      { status: 401 },
    );
  }

  let secret: ResendWebhookSecret;

  try {
    const env = verifyInvitationEnv(process.env);
    if (!env.resendWebhookSecret) {
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 400 },
      );
    }
    secret = env.resendWebhookSecret;
  } catch {
    return NextResponse.json(
      { error: "Webhook configuration error" },
      { status: 400 },
    );
  }

  let payload: unknown;

  try {
    payload = verifyResendWebhookSignature({
      payload: rawBody,
      headers: {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      },
      secret,
    });
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      return NextResponse.json(
        { error: "Invalid webhook signature" },
        { status: 401 },
      );
    }
    throw error;
  }

  const deliveryEvent = mapResendEventToDeliveryEvent(payload);
  const result =
    await handleAuthenticatedEmailProviderEventWorkflow(deliveryEvent);

  return NextResponse.json(result, { status: 200 });
}
