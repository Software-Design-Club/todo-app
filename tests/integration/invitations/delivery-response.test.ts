import type {
  DeliveryEventType,
  InvitationId,
  ProviderEventReceivedAt,
  ProviderMessageId,
  ProviderRawEventType,
  User,
} from "@/lib/types";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getIntegrationSqlClient } from "../../setup/integration";

async function importInvitationServices() {
  const client = getIntegrationSqlClient();

  vi.resetModules();
  vi.doMock("@vercel/postgres", async () => {
    const actual =
      await vi.importActual<typeof import("@vercel/postgres")>(
        "@vercel/postgres",
      );

    return {
      ...actual,
      sql: client,
    };
  });

  return {
    ...(await import("../../../lib/invitations/service")),
    ...(await import("../../../lib/email/service")),
  };
}

afterEach(() => {
  vi.doUnmock("@vercel/postgres");
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function insertUser(name: string, email: string) {
  const client = getIntegrationSqlClient();
  const result = await client.sql<{ id: number }>`
    insert into todo_users (name, email, status)
    values (${name}, ${email}, 'active')
    returning id
  `;

  return result.rows[0]!.id as User["id"];
}

async function insertList(title: string, creatorId: User["id"]) {
  const client = getIntegrationSqlClient();
  const result = await client.sql<{ id: number }>`
    insert into lists (title, "creatorId", visibility, state)
    values (${title}, ${creatorId}, 'private', 'active')
    returning id
  `;

  return result.rows[0]!.id as number;
}

async function addCollaboratorRow(input: {
  listId: number;
  userId: User["id"];
  role: "owner" | "collaborator";
}) {
  const client = getIntegrationSqlClient();

  await client.sql`
    insert into list_collaborators ("listId", "userId", role)
    values (${input.listId}, ${input.userId}, ${input.role})
  `;
}

async function insertSentInvitation(input: {
  listId: number;
  inviterId: User["id"];
  email: string;
  providerMessageId?: string;
}) {
  const client = getIntegrationSqlClient();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const result = await client.sql<{ id: number }>`
    insert into invitations (
      "listId", "inviterId", "invitedEmailNormalized", role, status,
      "secretHash", "expiresAt", "providerMessageId", "createdAt", "updatedAt"
    )
    values (
      ${input.listId}, ${input.inviterId}, ${input.email}, 'collaborator', 'sent',
      ${"hash-" + Date.now()}, ${expiresAt.toISOString()}, ${input.providerMessageId ?? null},
      ${now.toISOString()}, ${now.toISOString()}
    )
    returning id
  `;

  return result.rows[0]!.id as unknown as InvitationId;
}

async function findInvitationDeliveryColumns(invitationId: InvitationId) {
  const client = getIntegrationSqlClient();
  const result = await client.sql<{
    providerMessageId: string | null;
    lastDeliveryError: string | null;
    lastDeliveryAttemptAt: string | null;
    deliveryEventType: string | null;
    providerRawEventType: string | null;
    providerEventReceivedAt: string | null;
    status: string;
  }>`
    select
      "providerMessageId",
      "lastDeliveryError",
      "lastDeliveryAttemptAt",
      "deliveryEventType",
      "providerRawEventType",
      "providerEventReceivedAt",
      status
    from invitations
    where id = ${invitationId as unknown as number}
  `;

  return result.rows[0]!;
}

describe("Phase 5 delivery response and webhook event handling", () => {
  it("recordInvitationSendResult persists providerMessageId on accepted_for_delivery", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Delivery Owner",
      `phase5-delivery-owner-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Delivery list", ownerId);

    await addCollaboratorRow({
      listId,
      userId: ownerId,
      role: "owner",
    });

    const invitationId = await insertSentInvitation({
      listId,
      inviterId: ownerId,
      email: "recipient@example.com",
    });

    const { recordInvitationSendResult } = await importInvitationServices();

    const now = new Date("2026-03-11T15:00:00.000Z");
    await recordInvitationSendResult({
      invitationId,
      result: {
        kind: "accepted_for_delivery",
        providerMessageId: "msg-accepted-123" as ProviderMessageId,
      },
      now,
    });

    const row = await findInvitationDeliveryColumns(invitationId);

    expect(row.providerMessageId).toBe("msg-accepted-123");
    expect(row.lastDeliveryAttemptAt).toBeTruthy();
    expect(row.lastDeliveryError).toBeNull();
    expect(row.status).toBe("sent");
  });

  it("recordInvitationSendResult persists lastDeliveryError on send_failed", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Failed Owner",
      `phase5-failed-owner-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Failed list", ownerId);

    await addCollaboratorRow({
      listId,
      userId: ownerId,
      role: "owner",
    });

    const invitationId = await insertSentInvitation({
      listId,
      inviterId: ownerId,
      email: "failrecipient@example.com",
    });

    const { recordInvitationSendResult } = await importInvitationServices();

    const now = new Date("2026-03-11T16:00:00.000Z");
    await recordInvitationSendResult({
      invitationId,
      result: {
        kind: "send_failed",
        providerErrorMessage: "Mailbox full" as never,
        providerErrorName: "ValidationError" as never,
      },
      now,
    });

    const row = await findInvitationDeliveryColumns(invitationId);

    expect(row.lastDeliveryError).toBe("ValidationError: Mailbox full");
    expect(row.lastDeliveryAttemptAt).toBeTruthy();
    expect(row.providerMessageId).toBeNull();
    expect(row.status).toBe("sent");
  });

  it("handleInvitationSendResponseWorkflow normalizes and persists an accepted response", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Workflow Delivery Owner",
      `phase5-wf-delivery-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Workflow delivery list", ownerId);

    await addCollaboratorRow({
      listId,
      userId: ownerId,
      role: "owner",
    });

    const invitationId = await insertSentInvitation({
      listId,
      inviterId: ownerId,
      email: "wfrecipient@example.com",
    });

    const { handleInvitationSendResponseWorkflow } =
      await importInvitationServices();

    const now = new Date("2026-03-11T17:00:00.000Z");
    const result = await handleInvitationSendResponseWorkflow({
      invitationId,
      emailServiceResponse: {
        kind: "accepted",
        providerMessageId: "msg-wf-accepted" as ProviderMessageId,
      },
      now,
    });

    expect(result).toEqual({
      kind: "accepted_for_delivery",
      providerMessageId: "msg-wf-accepted",
    });

    const row = await findInvitationDeliveryColumns(invitationId);

    expect(row.providerMessageId).toBe("msg-wf-accepted");
    expect(row.status).toBe("sent");
  });

  it("recordInvitationDeliveryEvent updates delivery columns when providerMessageId matches", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Webhook Owner",
      `phase5-webhook-owner-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Webhook list", ownerId);

    await addCollaboratorRow({
      listId,
      userId: ownerId,
      role: "owner",
    });

    const providerMsgId = `msg-webhook-${emailSuffix}`;
    const invitationId = await insertSentInvitation({
      listId,
      inviterId: ownerId,
      email: "webhookrecipient@example.com",
      providerMessageId: providerMsgId,
    });

    const { recordInvitationDeliveryEvent } =
      await importInvitationServices();

    const receivedAt = new Date("2026-03-11T18:00:00.000Z");
    const persistence = await recordInvitationDeliveryEvent({
      kind: "delivery_reported",
      deliveryEventType: "bounced" as DeliveryEventType,
      providerMessageId: providerMsgId as ProviderMessageId,
      providerRawEventType: "email.bounced" as ProviderRawEventType,
      receivedAt: receivedAt as ProviderEventReceivedAt,
    });

    expect(persistence).toBe("updated");

    const row = await findInvitationDeliveryColumns(invitationId);

    expect(row.deliveryEventType).toBe("bounced");
    expect(row.providerRawEventType).toBe("email.bounced");
    expect(row.providerEventReceivedAt).toBeTruthy();
    expect(row.status).toBe("sent");
  });

  it("recordInvitationDeliveryEvent returns ignored when no matching providerMessageId exists", async () => {
    const { recordInvitationDeliveryEvent } =
      await importInvitationServices();

    const persistence = await recordInvitationDeliveryEvent({
      kind: "delivery_reported",
      deliveryEventType: "bounced" as DeliveryEventType,
      providerMessageId: "nonexistent-msg-id" as ProviderMessageId,
      providerRawEventType: "email.bounced" as ProviderRawEventType,
      receivedAt: new Date("2026-03-11T19:00:00.000Z") as ProviderEventReceivedAt,
    });

    expect(persistence).toBe("ignored");
  });

  it("recordInvitationDeliveryEvent returns ignored for ignored events", async () => {
    const { recordInvitationDeliveryEvent } =
      await importInvitationServices();

    const persistence = await recordInvitationDeliveryEvent({
      kind: "ignored",
      providerRawEventType: "email.delivered" as ProviderRawEventType,
      providerMessageId: "some-msg-id" as ProviderMessageId,
      receivedAt: new Date("2026-03-11T20:00:00.000Z") as ProviderEventReceivedAt,
    });

    expect(persistence).toBe("ignored");
  });
});
