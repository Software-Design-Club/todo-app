import { afterEach, describe, expect, it, vi } from "vitest";

import { getIntegrationSqlClient } from "../../setup/integration";

async function importListActions() {
  const client = getIntegrationSqlClient();
  vi.resetModules();
  vi.doMock("@vercel/postgres", async () => {
    const actual =
      await vi.importActual<typeof import("@vercel/postgres")>(
        "@vercel/postgres",
      );
    return { ...actual, sql: client };
  });
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
  return import("../../../app/lists/_actions/list");
}

async function importInvitationServices() {
  const client = getIntegrationSqlClient();
  vi.resetModules();
  vi.doMock("@vercel/postgres", async () => {
    const actual =
      await vi.importActual<typeof import("@vercel/postgres")>(
        "@vercel/postgres",
      );
    return { ...actual, sql: client };
  });
  return import("../../../lib/invitations/service");
}

afterEach(() => {
  vi.doUnmock("@vercel/postgres");
  vi.doUnmock("next/cache");
  vi.resetModules();
});

async function insertUser(name: string, email: string) {
  const client = getIntegrationSqlClient();
  const result = await client.sql<{ id: number }>`
    insert into todo_users (name, email, status) values (${name}, ${email}, 'active') returning id
  `;
  return result.rows[0]!.id;
}

async function insertList(title: string, creatorId: number) {
  const client = getIntegrationSqlClient();
  const result = await client.sql<{ id: number }>`
    insert into lists (title, "creatorId", visibility, state) values (${title}, ${creatorId}, 'private', 'active') returning id
  `;
  return result.rows[0]!.id;
}

async function addCollaboratorRow(input: {
  listId: number;
  userId: number;
  role: string;
}) {
  const client = getIntegrationSqlClient();
  await client.sql`insert into list_collaborators ("listId", "userId", role) values (${input.listId}, ${input.userId}, ${input.role})`;
}

async function insertInvitation(input: {
  listId: number;
  inviterId: number;
  email: string;
  status: string;
  secretHash: string;
  expiresAt?: string;
}) {
  const client = getIntegrationSqlClient();
  if (input.status === "revoked" || input.status === "expired") {
    const result = await client.sql<{ id: number }>`
      insert into invitations ("listId", "inviterId", "invitedEmailNormalized", role, status, "secretHash", "expiresAt", "resolvedAt")
      values (${input.listId}, ${input.inviterId}, ${input.email}, 'collaborator', ${input.status}, ${input.secretHash}, now() + interval '7 days', now())
      returning id
    `;
    return result.rows[0]!.id;
  }
  if (input.status === "accepted") {
    const result = await client.sql<{ id: number }>`
      insert into invitations ("listId", "inviterId", "invitedEmailNormalized", role, status, "secretHash", "expiresAt", "acceptedByUserId", "resolvedAt")
      values (${input.listId}, ${input.inviterId}, ${input.email}, 'collaborator', ${input.status}, ${input.secretHash}, now() + interval '7 days', ${input.inviterId}, now())
      returning id
    `;
    return result.rows[0]!.id;
  }
  const result = await client.sql<{ id: number }>`
    insert into invitations ("listId", "inviterId", "invitedEmailNormalized", role, status, "secretHash", "expiresAt")
    values (${input.listId}, ${input.inviterId}, ${input.email}, 'collaborator', ${input.status}, ${input.secretHash}, now() + interval '7 days')
    returning id
  `;
  return result.rows[0]!.id;
}

async function findInvitationRows(listId: number) {
  const client = getIntegrationSqlClient();
  const result = await client.sql<{
    id: number;
    status: string;
    resolvedAt: string | null;
  }>`
    select id, status, "resolvedAt" from invitations where "listId" = ${listId} order by id
  `;
  return result.rows;
}

async function countCollaboratorRows(listId: number) {
  const client = getIntegrationSqlClient();
  const result = await client.sql<{ count: string }>`
    select count(*)::text as count from list_collaborators where "listId" = ${listId}
  `;
  return Number(result.rows[0]!.count);
}

describe("Contract 7.3: invalidateOpenInvitesForList", () => {
  it("moves one open invite to revoked status with resolvedAt set", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Lifecycle Owner",
      `lifecycle-owner-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Lifecycle list", ownerId);
    const inviteId = await insertInvitation({
      listId,
      inviterId: ownerId,
      email: "open@example.com",
      status: "sent",
      secretHash: "hash-open-1",
    });

    const { invalidateOpenInvitesForList } =
      await importInvitationServices();
    const now = new Date("2026-03-11T12:00:00.000Z");
    const count = await invalidateOpenInvitesForList({
      listId: listId as never,
      now,
      terminalStatus: "revoked",
    });

    expect(count).toBe(1);
    const rows = await findInvitationRows(listId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: inviteId,
      status: "revoked",
    });
    expect(rows[0]!.resolvedAt).not.toBeNull();
  });

  it("invalidates only open invitations, leaving accepted and terminal unchanged", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Mixed Status Owner",
      `mixed-owner-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Mixed status list", ownerId);

    const pendingId = await insertInvitation({
      listId,
      inviterId: ownerId,
      email: "pending@example.com",
      status: "pending",
      secretHash: "hash-pending",
    });
    const sentId = await insertInvitation({
      listId,
      inviterId: ownerId,
      email: "sent@example.com",
      status: "sent",
      secretHash: "hash-sent",
    });
    const acceptedId = await insertInvitation({
      listId,
      inviterId: ownerId,
      email: "accepted@example.com",
      status: "accepted",
      secretHash: "hash-accepted",
    });
    const revokedId = await insertInvitation({
      listId,
      inviterId: ownerId,
      email: "revoked@example.com",
      status: "revoked",
      secretHash: "hash-revoked",
    });
    const expiredId = await insertInvitation({
      listId,
      inviterId: ownerId,
      email: "expired@example.com",
      status: "expired",
      secretHash: "hash-expired",
    });

    const { invalidateOpenInvitesForList } =
      await importInvitationServices();
    const now = new Date("2026-03-11T13:00:00.000Z");
    const count = await invalidateOpenInvitesForList({
      listId: listId as never,
      now,
      terminalStatus: "expired",
    });

    expect(count).toBe(2);
    const rows = await findInvitationRows(listId);
    expect(rows).toHaveLength(5);

    const statusById = new Map(rows.map((r) => [r.id, r.status]));
    expect(statusById.get(pendingId)).toBe("expired");
    expect(statusById.get(sentId)).toBe("expired");
    expect(statusById.get(acceptedId)).toBe("accepted");
    expect(statusById.get(revokedId)).toBe("revoked");
    expect(statusById.get(expiredId)).toBe("expired");
  });

  it("does not modify list_collaborators", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Collab Preserved Owner",
      `collab-preserved-${emailSuffix}@example.com`,
    );
    const collaboratorId = await insertUser(
      "Collab User",
      `collab-user-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Collab preserved list", ownerId);
    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });
    await addCollaboratorRow({
      listId,
      userId: collaboratorId,
      role: "collaborator",
    });

    await insertInvitation({
      listId,
      inviterId: ownerId,
      email: "new-invite@example.com",
      status: "sent",
      secretHash: "hash-collab",
    });

    const countBefore = await countCollaboratorRows(listId);
    const { invalidateOpenInvitesForList } =
      await importInvitationServices();

    await invalidateOpenInvitesForList({
      listId: listId as never,
      now: new Date("2026-03-11T14:00:00.000Z"),
      terminalStatus: "revoked",
    });

    const countAfter = await countCollaboratorRows(listId);
    expect(countAfter).toBe(countBefore);
  });

  it("does not touch other lists' invitations", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Isolation Owner",
      `isolation-owner-${emailSuffix}@example.com`,
    );
    const targetListId = await insertList("Target list", ownerId);
    const otherListId = await insertList("Other list", ownerId);

    await insertInvitation({
      listId: targetListId,
      inviterId: ownerId,
      email: "target@example.com",
      status: "sent",
      secretHash: "hash-target",
    });
    await insertInvitation({
      listId: otherListId,
      inviterId: ownerId,
      email: "other@example.com",
      status: "sent",
      secretHash: "hash-other",
    });

    const { invalidateOpenInvitesForList } =
      await importInvitationServices();

    await invalidateOpenInvitesForList({
      listId: targetListId as never,
      now: new Date("2026-03-11T15:00:00.000Z"),
      terminalStatus: "revoked",
    });

    const targetRows = await findInvitationRows(targetListId);
    const otherRows = await findInvitationRows(otherListId);

    expect(targetRows[0]!.status).toBe("revoked");
    expect(otherRows[0]!.status).toBe("sent");
  });
});

describe("Contract 7.1: archiveList with invalidation", () => {
  it("archives a list and revokes all open invitations in one transaction", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Archive Owner",
      `archive-owner-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Archive list", ownerId);
    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });

    await insertInvitation({
      listId,
      inviterId: ownerId,
      email: "archive-invite@example.com",
      status: "sent",
      secretHash: "hash-archive",
    });
    await insertInvitation({
      listId,
      inviterId: ownerId,
      email: "archive-pending@example.com",
      status: "pending",
      secretHash: "hash-archive-pending",
    });

    const { archiveList } = await importListActions();
    const result = await archiveList(
      listId as never,
      ownerId as never,
    );

    expect(result.state).toBe("archived");

    const invRows = await findInvitationRows(listId);
    expect(invRows).toHaveLength(2);
    for (const row of invRows) {
      expect(row.status).toBe("revoked");
      expect(row.resolvedAt).not.toBeNull();
    }
  });

  it("preserves accepted collaborators after archive", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Archive Collab Owner",
      `archive-collab-owner-${emailSuffix}@example.com`,
    );
    const collaboratorId = await insertUser(
      "Archive Collab User",
      `archive-collab-user-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Archive collab list", ownerId);
    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });
    await addCollaboratorRow({
      listId,
      userId: collaboratorId,
      role: "collaborator",
    });

    await insertInvitation({
      listId,
      inviterId: ownerId,
      email: "archive-collab-inv@example.com",
      status: "sent",
      secretHash: "hash-archive-collab",
    });

    const collaboratorCountBefore = await countCollaboratorRows(listId);

    const { archiveList } = await importListActions();
    await archiveList(listId as never, ownerId as never);

    const collaboratorCountAfter = await countCollaboratorRows(listId);
    expect(collaboratorCountAfter).toBe(collaboratorCountBefore);
  });

  it("does not affect invitations on unrelated lists", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Archive Isolation Owner",
      `archive-isolation-${emailSuffix}@example.com`,
    );
    const archiveListId = await insertList("Archive isolation list", ownerId);
    const otherListId = await insertList("Other isolation list", ownerId);
    await addCollaboratorRow({
      listId: archiveListId,
      userId: ownerId,
      role: "owner",
    });

    await insertInvitation({
      listId: archiveListId,
      inviterId: ownerId,
      email: "archive-iso@example.com",
      status: "sent",
      secretHash: "hash-archive-iso",
    });
    await insertInvitation({
      listId: otherListId,
      inviterId: ownerId,
      email: "other-iso@example.com",
      status: "sent",
      secretHash: "hash-other-iso",
    });

    const { archiveList } = await importListActions();
    await archiveList(archiveListId as never, ownerId as never);

    const otherRows = await findInvitationRows(otherListId);
    expect(otherRows[0]!.status).toBe("sent");
  });
});

describe("Contract 7.2: deleteList with invalidation", () => {
  it("deletes a list and cascade-deletes invitation rows, making secrets unusable", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Delete Owner",
      `delete-owner-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Delete list", ownerId);
    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });

    await insertInvitation({
      listId,
      inviterId: ownerId,
      email: "delete-invite@example.com",
      status: "sent",
      secretHash: "hash-delete",
    });

    const { deleteList } = await importListActions();
    await deleteList(listId as never, ownerId as never);

    const rows = await findInvitationRows(listId);
    expect(rows).toHaveLength(0);
  });
});
