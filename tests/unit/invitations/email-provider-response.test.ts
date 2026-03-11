import { describe, expect, it } from "vitest";

import { normalizeEmailServiceSendResponse } from "@/lib/invitations/service";
import type {
  EmailServiceErrorMessage,
  EmailServiceErrorName,
  ProviderMessageId,
} from "@/lib/types";

describe("normalizeEmailServiceSendResponse", () => {
  it("maps accepted response to accepted_for_delivery", () => {
    const result = normalizeEmailServiceSendResponse({
      kind: "accepted",
      providerMessageId: "msg-123" as ProviderMessageId,
    });

    expect(result).toEqual({
      kind: "accepted_for_delivery",
      providerMessageId: "msg-123",
    });
  });

  it("maps rejected response to send_failed", () => {
    const result = normalizeEmailServiceSendResponse({
      kind: "rejected",
      errorMessage: "Mailbox full" as EmailServiceErrorMessage,
      errorName: "ValidationError" as EmailServiceErrorName,
    });

    expect(result).toEqual({
      kind: "send_failed",
      providerErrorMessage: "Mailbox full",
      providerErrorName: "ValidationError",
    });
  });

  it("maps rejected response without errorName to send_failed", () => {
    const result = normalizeEmailServiceSendResponse({
      kind: "rejected",
      errorMessage: "Unknown error" as EmailServiceErrorMessage,
    });

    expect(result).toEqual({
      kind: "send_failed",
      providerErrorMessage: "Unknown error",
      providerErrorName: undefined,
    });
  });
});
