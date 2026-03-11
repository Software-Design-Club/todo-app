import type { User } from "@/lib/types";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getIntegrationSqlClient } from "../../setup/integration";

async function importPermissionsActions() {
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

  return import("../../../app/lists/_actions/permissions");
}

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

  const invitationService = await import("../../../lib/invitations/service");
  const emailService = await import("../../../lib/email/service");
  const tokenService = await import("../../../lib/invitations/token");

  return {
    ...invitationService,
    ...emailService,
    ...tokenService,
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

async function countRows(tableName: "list_collaborators" | "invitations") {
  const client = getIntegrationSqlClient();
  const result =
    tableName === "invitations"
      ? await client.sql<{ count: string }>`
          select count(*)::text as count
          from invitations
        `
      : await client.sql<{ count: string }>`
          select count(*)::text as count
          from list_collaborators
        `;

  return Number(result.rows[0]!.count);
}

async function findInvitationRows(listId: number) {
  const client = getIntegrationSqlClient();
  const result = await client.sql<{
    id: number;
    inviterId: number | null;
    invitedEmailNormalized: string | null;
    status: string;
    secretHash: string | null;
    expiresAt: string | null;
  }>`
    select
      id,
      "inviterId",
      "invitedEmailNormalized",
      status,
      "secretHash",
      "expiresAt"
    from invitations
    where "listId" = ${listId}
    order by id
  `;

  return result.rows;
}

describe("Phase 4 invitation issuing", () => {
  it("rejects denied actors with InvitationPermissionDeniedError", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Invite Owner",
      `phase4-owner-${emailSuffix}@example.com`,
    );
    const deniedActorId = await insertUser(
      "Denied Actor",
      `phase4-denied-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Invitation permission list", ownerId);

    await addCollaboratorRow({
      listId,
      userId: ownerId,
      role: "owner",
    });

    const { assertCanInviteCollaborators } = await importPermissionsActions();

    await expect(
      assertCanInviteCollaborators({
        listId: listId as never,
        actorId: deniedActorId,
      }),
    ).rejects.toMatchObject({
      name: "InvitationPermissionDeniedError",
    });
  });

  it("allows owner actors to pass the invitation permission check without mutating state", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Allowed Owner",
      `phase4-allowed-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Allowed permission list", ownerId);

    await addCollaboratorRow({
      listId,
      userId: ownerId,
      role: "owner",
    });

    const invitationCountBefore = await countRows("invitations");
    const collaboratorCountBefore = await countRows("list_collaborators");
    const { assertCanInviteCollaborators } = await importPermissionsActions();

    await expect(
      assertCanInviteCollaborators({
        listId: listId as never,
        actorId: ownerId,
      }),
    ).resolves.toBeUndefined();

    expect(await countRows("invitations")).toBe(invitationCountBefore);
    expect(await countRows("list_collaborators")).toBe(collaboratorCountBefore);
  });

  it("persists a first-time sent invitation without sending email", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Issue Invitation Owner",
      `phase4-issue-owner-${emailSuffix}@example.com`,
    );
    const listId = await insertList("First invitation list", ownerId);

    await addCollaboratorRow({
      listId,
      userId: ownerId,
      role: "owner",
    });

    const {
      issueInvitation,
    } = await importInvitationServices();

    const now = new Date("2026-03-11T15:00:00.000Z");
    const result = await issueInvitation({
      listId: listId as never,
      inviterId: ownerId,
      invitedEmail: "Invitee@Example.com" as never,
      secretHash: "hash-1" as never,
      now,
    });

    expect(result).toMatchObject({
      status: "sent",
      wasRotated: false,
    });

    await expect(findInvitationRows(listId)).resolves.toEqual([
      expect.objectContaining({
        id: Number(result.invitationId),
        inviterId: Number(ownerId),
        invitedEmailNormalized: "invitee@example.com",
        status: "sent",
        secretHash: "hash-1",
        expiresAt: "2026-03-18 15:00:00",
      }),
    ]);
  });

  it("rotates an existing open invitation while preserving the single-open-invite invariant", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Rotation Owner",
      `phase4-rotate-owner-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Rotate invitation list", ownerId);

    await addCollaboratorRow({
      listId,
      userId: ownerId,
      role: "owner",
    });

    const {
      issueInvitation,
    } = await importInvitationServices();

    await issueInvitation({
      listId: listId as never,
      inviterId: ownerId,
      invitedEmail: "Rotatee@example.com" as never,
      secretHash: "hash-before" as never,
      now: new Date("2026-03-11T16:00:00.000Z"),
    });

    const rotatedInvitation = await issueInvitation({
      listId: listId as never,
      inviterId: ownerId,
      invitedEmail: "rotatee@example.com" as never,
      secretHash: "hash-after" as never,
      now: new Date("2026-03-11T17:00:00.000Z"),
    });

    const invitationRows = await findInvitationRows(listId);

    expect(rotatedInvitation).toMatchObject({
      status: "sent",
      wasRotated: true,
    });
    expect(invitationRows).toHaveLength(1);
    expect(invitationRows[0]).toEqual(
      expect.objectContaining({
        id: Number(rotatedInvitation.invitationId),
        invitedEmailNormalized: "rotatee@example.com",
        secretHash: "hash-after",
        status: "sent",
        expiresAt: "2026-03-18 17:00:00",
      }),
    );
  });

  it("invites a collaborator end-to-end and returns the generic accepted email-service response unchanged", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Workflow Owner",
      `phase4-workflow-owner-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Workflow invitation list", ownerId);

    await addCollaboratorRow({
      listId,
      userId: ownerId,
      role: "owner",
    });

    const {
      inviteCollaboratorWorkflow,
      hashInvitationSecret,
      setEmailServiceForTesting,
    } = await importInvitationServices();
    const acceptedResponse = {
      kind: "accepted" as const,
      providerMessageId: "provider-accepted" as never,
    };
    const emailSendSpy = vi.fn().mockResolvedValue(acceptedResponse);

    setEmailServiceForTesting({
      sendInvitationEmail: emailSendSpy,
    });
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("EMAIL_FROM", "owner@example.com");
    vi.stubEnv("APP_BASE_URL", "https://example.com/app");

    const result = await inviteCollaboratorWorkflow({
      listId: listId as never,
      inviterId: ownerId,
      invitedEmail: "HappyPath@example.com" as never,
      now: new Date("2026-03-11T18:00:00.000Z"),
    });
    const invitationRows = await findInvitationRows(listId);
    const token = new URL(result.acceptanceUrl).searchParams.get("token");

    expect(emailSendSpy).toHaveBeenCalledTimes(1);
    expect(result.emailServiceResponse).toEqual(acceptedResponse);
    expect(result.acceptanceUrl).toMatch(
      /^https:\/\/example\.com\/invite\?token=/,
    );
    expect(token).toBeTruthy();
    expect(invitationRows).toEqual([
      expect.objectContaining({
        id: Number(result.invitationId),
        inviterId: Number(ownerId),
        invitedEmailNormalized: "happypath@example.com",
        status: "sent",
        secretHash: hashInvitationSecret(token as never),
        expiresAt: "2026-03-18 18:00:00",
      }),
    ]);
  });

  it("keeps the sent invitation persisted when the email service immediately rejects delivery", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Failed Delivery Owner",
      `phase4-failed-owner-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Failed delivery invitation list", ownerId);

    await addCollaboratorRow({
      listId,
      userId: ownerId,
      role: "owner",
    });

    const { inviteCollaboratorWorkflow, setEmailServiceForTesting } =
      await importInvitationServices();
    const rejectedResponse = {
      kind: "rejected" as const,
      errorMessage: "temporary failure" as never,
      errorName: "TemporaryFailure" as never,
    };

    setEmailServiceForTesting({
      sendInvitationEmail: vi.fn().mockResolvedValue(rejectedResponse),
    });
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("EMAIL_FROM", "owner@example.com");
    vi.stubEnv("APP_BASE_URL", "https://example.com");

    await expect(
      inviteCollaboratorWorkflow({
        listId: listId as never,
        inviterId: ownerId,
        invitedEmail: "Failure@example.com" as never,
        now: new Date("2026-03-11T19:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      emailServiceResponse: rejectedResponse,
    });

    await expect(findInvitationRows(listId)).resolves.toEqual([
      expect.objectContaining({
        inviterId: Number(ownerId),
        invitedEmailNormalized: "failure@example.com",
        status: "sent",
      }),
    ]);
  });

  it("rotates workflow-issued secrets so the latest acceptance URL is authoritative", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Workflow Rotation Owner",
      `phase4-workflow-rotate-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Workflow rotate list", ownerId);

    await addCollaboratorRow({
      listId,
      userId: ownerId,
      role: "owner",
    });

    const {
      inviteCollaboratorWorkflow,
      hashInvitationSecret,
      setEmailServiceForTesting,
    } = await importInvitationServices();

    setEmailServiceForTesting({
      sendInvitationEmail: vi.fn().mockResolvedValue({
        kind: "accepted",
        providerMessageId: "provider-rotation" as never,
      }),
    });
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("EMAIL_FROM", "owner@example.com");
    vi.stubEnv("APP_BASE_URL", "https://example.com");

    const firstResult = await inviteCollaboratorWorkflow({
      listId: listId as never,
      inviterId: ownerId,
      invitedEmail: "RotateWorkflow@example.com" as never,
      now: new Date("2026-03-11T21:00:00.000Z"),
    });
    const secondResult = await inviteCollaboratorWorkflow({
      listId: listId as never,
      inviterId: ownerId,
      invitedEmail: "rotateworkflow@example.com" as never,
      now: new Date("2026-03-11T22:00:00.000Z"),
    });
    const firstToken = new URL(firstResult.acceptanceUrl).searchParams.get("token");
    const secondToken = new URL(secondResult.acceptanceUrl).searchParams.get("token");
    const invitationRows = await findInvitationRows(listId);

    expect(firstToken).toBeTruthy();
    expect(secondToken).toBeTruthy();
    expect(firstToken).not.toBe(secondToken);
    expect(invitationRows).toHaveLength(1);
    expect(invitationRows[0]).toEqual(
      expect.objectContaining({
        id: Number(secondResult.invitationId),
        secretHash: hashInvitationSecret(secondToken as never),
      }),
    );
    expect(invitationRows[0]?.secretHash).not.toBe(
      hashInvitationSecret(firstToken as never),
    );
  });

  it("raises ListNotFoundError when the workflow targets a missing list", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Missing List Owner",
      `phase4-missing-owner-${emailSuffix}@example.com`,
    );
    const { inviteCollaboratorWorkflow, setEmailServiceForTesting } =
      await importInvitationServices();

    setEmailServiceForTesting({
      sendInvitationEmail: vi.fn(),
    });
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("EMAIL_FROM", "owner@example.com");
    vi.stubEnv("APP_BASE_URL", "https://example.com");

    await expect(
      inviteCollaboratorWorkflow({
        listId: 999999 as never,
        inviterId: ownerId,
        invitedEmail: "Missing@example.com" as never,
        now: new Date("2026-03-11T20:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      name: "ListNotFoundError",
    });
  });
});
