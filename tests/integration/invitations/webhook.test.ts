import { NextRequest } from "next/server";
import type { EmailBouncedEvent } from "resend";
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyWebhookPayloadMock = vi.fn();
const updateInvitationEmailDeliveryStatusMock = vi.fn();

vi.mock("@/lib/email/resend", () => ({
  verifyWebhookPayload: verifyWebhookPayloadMock,
}));

vi.mock("@/lib/invitations/service", () => ({
  updateInvitationEmailDeliveryStatus:
    updateInvitationEmailDeliveryStatusMock,
}));

function buildWebhookRequest(
  payload: string,
  headers: Record<string, string> = {}
) {
  return new NextRequest("http://localhost/api/webhooks/resend", {
    method: "POST",
    body: payload,
    headers,
  });
}

describe("resend webhook route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.RESEND_WEBHOOK_SECRET;
  });

  it("returns 503 when webhook secret is missing", async () => {
    const request = buildWebhookRequest("{}", {
      "svix-id": "msg_1",
      "svix-timestamp": "1700000000",
      "svix-signature": "v1,signature",
    });

    const { POST } = await import("@/app/api/webhooks/resend/route");
    const response = await POST(request);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Webhook secret not configured.",
    });
    expect(verifyWebhookPayloadMock).not.toHaveBeenCalled();
  });

  it("returns 401 when Svix headers are missing", async () => {
    process.env.RESEND_WEBHOOK_SECRET = "whsec_test";
    const request = buildWebhookRequest("{}");

    const { POST } = await import("@/app/api/webhooks/resend/route");
    const response = await POST(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Missing webhook signature headers.",
    });
    expect(verifyWebhookPayloadMock).not.toHaveBeenCalled();
  });

  it("returns 401 when signature verification fails", async () => {
    process.env.RESEND_WEBHOOK_SECRET = "whsec_test";
    verifyWebhookPayloadMock.mockImplementationOnce(() => {
      throw new Error("invalid signature");
    });

    const request = buildWebhookRequest("{\"type\":\"email.bounced\"}", {
      "svix-id": "msg_2",
      "svix-timestamp": "1700000001",
      "svix-signature": "v1,invalid",
    });

    const { POST } = await import("@/app/api/webhooks/resend/route");
    const response = await POST(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid signature.",
    });
    expect(updateInvitationEmailDeliveryStatusMock).not.toHaveBeenCalled();
  });

  it("accepts valid Svix payloads and persists delivery failure metadata", async () => {
    process.env.RESEND_WEBHOOK_SECRET = "whsec_test";

    const bouncedEvent: EmailBouncedEvent = {
      type: "email.bounced",
      created_at: "2024-01-01T00:00:00Z",
      data: {
        created_at: "2024-01-01T00:00:00Z",
        email_id: "provider-msg-1",
        from: "noreply@example.com",
        to: ["user@example.com"],
        subject: "Test",
        bounce: {
          message: "Mailbox not found",
          subType: "hard",
          type: "hard_bounce",
        },
      },
    };
    verifyWebhookPayloadMock.mockReturnValueOnce(bouncedEvent);
    updateInvitationEmailDeliveryStatusMock.mockResolvedValueOnce(null);

    const payload = "{\"type\":\"email.bounced\"}";
    const request = buildWebhookRequest(payload, {
      "svix-id": "msg_3",
      "svix-timestamp": "1700000002",
      "svix-signature": "v1,valid",
    });

    const { POST } = await import("@/app/api/webhooks/resend/route");
    const response = await POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(verifyWebhookPayloadMock).toHaveBeenCalledWith({
      payload,
      svixId: "msg_3",
      svixTimestamp: "1700000002",
      svixSignature: "v1,valid",
      webhookSecret: "whsec_test",
    });
    expect(updateInvitationEmailDeliveryStatusMock).toHaveBeenCalledWith({
      providerId: "provider-msg-1",
      status: "failed",
      errorMessage: "Email bounced - recipient address invalid.",
    });
  });
});
