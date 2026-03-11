import { describe, expect, it } from "vitest";
import { Webhook } from "svix";

import {
  verifyResendWebhookSignature,
  mapResendEventToDeliveryEvent,
} from "@/lib/email/resend";
import { InvalidWebhookSignatureError } from "@/lib/invitations/errors";
import type { ResendWebhookSecret } from "@/lib/types";

function generateSignedPayload(
  secret: string,
  payload: Record<string, unknown>,
) {
  const wh = new Webhook(secret);
  const msgId = "msg_test123";
  const timestamp = new Date();
  const body = JSON.stringify(payload);
  const signature = wh.sign(msgId, timestamp, body);

  return {
    body,
    headers: {
      "svix-id": msgId,
      "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "svix-signature": signature,
    },
  };
}

const TEST_SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";

describe("verifyResendWebhookSignature", () => {
  it("throws InvalidWebhookSignatureError on invalid signature", () => {
    expect(() =>
      verifyResendWebhookSignature({
        payload: '{"type":"email.delivered","data":{"email_id":"abc"}}',
        headers: {
          "svix-id": "msg_bad",
          "svix-timestamp": String(Math.floor(Date.now() / 1000)),
          "svix-signature": "v1,invalid_signature_value",
        },
        secret: TEST_SECRET as ResendWebhookSecret,
      }),
    ).toThrow(InvalidWebhookSignatureError);
  });

  it("returns the verified payload for a valid signature", () => {
    const eventPayload = {
      type: "email.bounced",
      data: { email_id: "msg-bounce-1" },
      created_at: "2026-03-11T12:00:00.000Z",
    };

    const signed = generateSignedPayload(TEST_SECRET, eventPayload);

    const result = verifyResendWebhookSignature({
      payload: signed.body,
      headers: signed.headers,
      secret: TEST_SECRET as ResendWebhookSecret,
    });

    expect(result).toMatchObject({
      type: "email.bounced",
      data: { email_id: "msg-bounce-1" },
    });
  });
});

describe("mapResendEventToDeliveryEvent", () => {
  it("maps email.bounced to delivery_reported with bounced type", () => {
    const result = mapResendEventToDeliveryEvent({
      type: "email.bounced",
      data: { email_id: "msg-1" },
      created_at: "2026-03-11T12:00:00.000Z",
    });

    expect(result).toEqual({
      kind: "delivery_reported",
      deliveryEventType: "bounced",
      providerMessageId: "msg-1",
      providerRawEventType: "email.bounced",
      receivedAt: new Date("2026-03-11T12:00:00.000Z"),
    });
  });

  it("maps email.delivery_delayed to delivery_reported with delayed type", () => {
    const result = mapResendEventToDeliveryEvent({
      type: "email.delivery_delayed",
      data: { email_id: "msg-2" },
      created_at: "2026-03-11T13:00:00.000Z",
    });

    expect(result).toEqual({
      kind: "delivery_reported",
      deliveryEventType: "delayed",
      providerMessageId: "msg-2",
      providerRawEventType: "email.delivery_delayed",
      receivedAt: new Date("2026-03-11T13:00:00.000Z"),
    });
  });

  it("maps email.complained to delivery_reported with complained type", () => {
    const result = mapResendEventToDeliveryEvent({
      type: "email.complained",
      data: { email_id: "msg-3" },
      created_at: "2026-03-11T14:00:00.000Z",
    });

    expect(result).toEqual({
      kind: "delivery_reported",
      deliveryEventType: "complained",
      providerMessageId: "msg-3",
      providerRawEventType: "email.complained",
      receivedAt: new Date("2026-03-11T14:00:00.000Z"),
    });
  });

  it("maps email.failed to delivery_reported with failed type", () => {
    const result = mapResendEventToDeliveryEvent({
      type: "email.failed",
      data: { email_id: "msg-4" },
      created_at: "2026-03-11T15:00:00.000Z",
    });

    expect(result).toEqual({
      kind: "delivery_reported",
      deliveryEventType: "failed",
      providerMessageId: "msg-4",
      providerRawEventType: "email.failed",
      receivedAt: new Date("2026-03-11T15:00:00.000Z"),
    });
  });

  it("maps email.delivered to ignored", () => {
    const result = mapResendEventToDeliveryEvent({
      type: "email.delivered",
      data: { email_id: "msg-5" },
      created_at: "2026-03-11T16:00:00.000Z",
    });

    expect(result).toEqual({
      kind: "ignored",
      providerRawEventType: "email.delivered",
      providerMessageId: "msg-5",
      receivedAt: new Date("2026-03-11T16:00:00.000Z"),
    });
  });

  it("maps unknown event types to ignored", () => {
    const result = mapResendEventToDeliveryEvent({
      type: "email.clicked",
      data: { email_id: "msg-6" },
      created_at: "2026-03-11T17:00:00.000Z",
    });

    expect(result).toEqual({
      kind: "ignored",
      providerRawEventType: "email.clicked",
      providerMessageId: "msg-6",
      receivedAt: new Date("2026-03-11T17:00:00.000Z"),
    });
  });
});
