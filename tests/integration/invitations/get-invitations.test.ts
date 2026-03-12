import type { User } from "@/lib/types";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getIntegrationSqlClient } from "../../setup/integration";

async function importInvitationActions(actorId?: User["id"]) {
  const client = getIntegrationSqlClient();

  vi.resetModules();
  vi.doMock("@/auth", () => ({
    auth: vi.fn().mockResolvedValue(
      actorId
        ? { user: { id: actorId } }
        : null,
    ),
  }));
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

  return import("../../../app/lists/_actions/invitations");
}

afterEach(() => {
  vi.doUnmock("@/auth");
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

async function insertInvitationWithStatus(input: {
  listId: number;
  inviterId: User["id"];
  invitedEmail: string;
  status: "pending" | "sent" | "accepted" | "pending_approval" | "revoked" | "expired";
  acceptedByUserId?: User["id"];
}) {
  const client = getIntegrationSqlClient();

  if (input.status === "accepted") {
    const result = await client.sql<{ id: number }>`
      insert into invitations ("listId", "inviterId", "invitedEmailNormalized", role, status, "secretHash", "expiresAt", "acceptedByUserId", "resolvedAt")
      values (
        ${input.listId},
        ${input.inviterId},
        ${input.invitedEmail},
        'collaborator',
        ${input.status},
        ${"hash-" + Math.random()},
        now() + interval '7 days',
        ${input.acceptedByUserId ?? input.inviterId},
        now()
      )
      returning id
    `;
    return result.rows[0]!.id as number;
  }

  if (input.status === "revoked" || input.status === "expired") {
    const result = await client.sql<{ id: number }>`
      insert into invitations ("listId", "inviterId", "invitedEmailNormalized", role, status, "secretHash", "expiresAt", "resolvedAt")
      values (
        ${input.listId},
        ${input.inviterId},
        ${input.invitedEmail},
        'collaborator',
        ${input.status},
        ${"hash-" + Math.random()},
        now() + interval '7 days',
        now()
      )
      returning id
    `;
    return result.rows[0]!.id as number;
  }

  if (input.status === "pending_approval") {
    const result = await client.sql<{ id: number }>`
      insert into invitations ("listId", "inviterId", "invitedEmailNormalized", role, status, "secretHash", "expiresAt", "acceptedByUserId")
      values (
        ${input.listId},
        ${input.inviterId},
        ${input.invitedEmail},
        'collaborator',
        'pending_approval',
        ${"hash-" + Math.random()},
        now() + interval '7 days',
        ${input.acceptedByUserId ?? input.inviterId}
      )
      returning id
    `;
    return result.rows[0]!.id as number;
  }

  // pending or sent
  const result = await client.sql<{ id: number }>`
    insert into invitations ("listId", "inviterId", "invitedEmailNormalized", role, status, "secretHash", "expiresAt")
    values (
      ${input.listId},
      ${input.inviterId},
      ${input.invitedEmail},
      'collaborator',
      ${input.status},
      ${"hash-" + Math.random()},
      now() + interval '7 days'
    )
    returning id
  `;
  return result.rows[0]!.id as number;
}

describe("getInvitations", () => {
  it("returns only sent and pending_approval invitations (not pending, accepted, revoked, expired)", async () => {
    const suffix = Date.now();
    const ownerId = await insertUser(
      "Get Invitations Owner",
      `get-inv-owner-${suffix}@example.com`,
    );
    const acceptorId = await insertUser(
      "Get Invitations Acceptor",
      `get-inv-acceptor-${suffix}@example.com`,
    );
    const listId = await insertList("Get invitations list", ownerId);

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });

    const sentId = await insertInvitationWithStatus({
      listId,
      inviterId: ownerId,
      invitedEmail: `get-inv-sent-${suffix}@example.com`,
      status: "sent",
    });

    const pendingApprovalId = await insertInvitationWithStatus({
      listId,
      inviterId: ownerId,
      invitedEmail: `get-inv-pending-approval-${suffix}@example.com`,
      status: "pending_approval",
      acceptedByUserId: acceptorId,
    });

    // These should NOT appear in the results:
    await insertInvitationWithStatus({
      listId,
      inviterId: ownerId,
      invitedEmail: `get-inv-pending-${suffix}@example.com`,
      status: "pending",
    });

    await insertInvitationWithStatus({
      listId,
      inviterId: ownerId,
      invitedEmail: `get-inv-accepted-${suffix}@example.com`,
      status: "accepted",
      acceptedByUserId: acceptorId,
    });

    await insertInvitationWithStatus({
      listId,
      inviterId: ownerId,
      invitedEmail: `get-inv-revoked-${suffix}@example.com`,
      status: "revoked",
    });

    await insertInvitationWithStatus({
      listId,
      inviterId: ownerId,
      invitedEmail: `get-inv-expired-${suffix}@example.com`,
      status: "expired",
    });

    const { getInvitations } = await importInvitationActions(ownerId);

    const result = await getInvitations(listId as never, ownerId);

    const resultIds = result.map((inv) => Number(inv.invitationId));
    expect(resultIds).toContain(sentId);
    expect(resultIds).toContain(pendingApprovalId);

    const statuses = result.map((inv) => inv.kind);
    expect(statuses.every((s) => s === "sent" || s === "pending_approval")).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("returns empty array when no open invitations exist for the list", async () => {
    const suffix = Date.now();
    const ownerId = await insertUser(
      "Get Inv Empty Owner",
      `get-inv-empty-owner-${suffix}@example.com`,
    );
    const listId = await insertList("Get invitations empty list", ownerId);

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });

    const { getInvitations } = await importInvitationActions(ownerId);

    const result = await getInvitations(listId as never, ownerId);

    expect(result).toEqual([]);
  });

  it("throws CollaboratorManagementPermissionDeniedError when caller is not a list owner", async () => {
    const suffix = Date.now();
    const ownerId = await insertUser(
      "Get Inv Owner 2",
      `get-inv-owner2-${suffix}@example.com`,
    );
    const nonOwnerId = await insertUser(
      "Get Inv Non Owner",
      `get-inv-nonowner-${suffix}@example.com`,
    );
    const listId = await insertList("Get invitations restricted list", ownerId);

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });
    await addCollaboratorRow({ listId, userId: nonOwnerId, role: "collaborator" });

    const { getInvitations } = await importInvitationActions(nonOwnerId);

    await expect(
      getInvitations(listId as never, nonOwnerId),
    ).rejects.toMatchObject({
      name: "CollaboratorManagementPermissionDeniedError",
    });
  });

  it("maps sent invitation rows to SentInvitationSummary with correct fields", async () => {
    const suffix = Date.now();
    const ownerId = await insertUser(
      "Get Inv Map Owner",
      `get-inv-map-owner-${suffix}@example.com`,
    );
    const listId = await insertList("Get invitations map list", ownerId);
    const invitedEmail = `get-inv-map-invited-${suffix}@example.com`;

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });

    const sentId = await insertInvitationWithStatus({
      listId,
      inviterId: ownerId,
      invitedEmail,
      status: "sent",
    });

    const { getInvitations } = await importInvitationActions(ownerId);

    const result = await getInvitations(listId as never, ownerId);

    const sentInvitation = result.find((inv) => Number(inv.invitationId) === sentId);
    expect(sentInvitation).toBeDefined();
    expect(sentInvitation?.kind).toBe("sent");
    expect(sentInvitation?.invitedEmailNormalized).toBe(invitedEmail);
    expect(Number(sentInvitation?.listId)).toBe(listId);
    if (sentInvitation?.kind === "sent") {
      expect(sentInvitation.expiresAt).toBeTruthy();
    }
  });

  it("maps pending_approval invitation rows to PendingApprovalInvitationSummary with correct fields", async () => {
    const suffix = Date.now();
    const ownerId = await insertUser(
      "Get Inv PA Owner",
      `get-inv-pa-owner-${suffix}@example.com`,
    );
    const acceptorId = await insertUser(
      "Get Inv PA Acceptor",
      `get-inv-pa-acceptor-${suffix}@example.com`,
    );
    const listId = await insertList("Get invitations PA list", ownerId);
    const invitedEmail = `get-inv-pa-invited-${suffix}@example.com`;

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });

    const paId = await insertInvitationWithStatus({
      listId,
      inviterId: ownerId,
      invitedEmail,
      status: "pending_approval",
      acceptedByUserId: acceptorId,
    });

    const { getInvitations } = await importInvitationActions(ownerId);

    const result = await getInvitations(listId as never, ownerId);

    const paInvitation = result.find((inv) => Number(inv.invitationId) === paId);
    expect(paInvitation).toBeDefined();
    expect(paInvitation?.kind).toBe("pending_approval");
    expect(paInvitation?.invitedEmailNormalized).toBe(invitedEmail);
    expect(Number(paInvitation?.listId)).toBe(listId);
    if (paInvitation?.kind === "pending_approval") {
      expect(Number(paInvitation.acceptedByUserId)).toBe(Number(acceptorId));
    }
  });
});
