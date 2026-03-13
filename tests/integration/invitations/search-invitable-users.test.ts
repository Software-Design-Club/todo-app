import type { User } from "@/lib/types";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getIntegrationSqlClient } from "../../setup/integration";

async function importCollaboratorActions() {
  const client = getIntegrationSqlClient();

  vi.resetModules();
  vi.doMock("@vercel/postgres", async () => {
    const actual =
      await vi.importActual<typeof import("@vercel/postgres")>("@vercel/postgres");

    return {
      ...actual,
      sql: client,
    };
  });

  return import("../../../app/lists/_actions/collaborators");
}

async function importCollaboratorActionsWithQueryCounter() {
  const client = getIntegrationSqlClient();
  let queryCount = 0;

  const countedSql = Object.assign(client.sql.bind(client), {
    ...client.sql,
    query: (...args: Parameters<typeof client.query>) => {
      queryCount += 1;
      return client.query(...args);
    },
  });

  vi.resetModules();
  vi.doMock("@vercel/postgres", async () => {
    const actual =
      await vi.importActual<typeof import("@vercel/postgres")>("@vercel/postgres");

    return {
      ...actual,
      sql: countedSql,
    };
  });

  const collaboratorActions = await import("../../../app/lists/_actions/collaborators");
  return { ...collaboratorActions, getQueryCount: () => queryCount };
}

afterEach(() => {
  vi.doUnmock("@vercel/postgres");
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

async function insertOpenInvitation(input: {
  listId: number;
  inviterId: User["id"];
  invitedEmail: string;
  status?: "sent" | "pending";
}) {
  const client = getIntegrationSqlClient();
  const status = input.status ?? "sent";
  const result = await client.sql<{ id: number }>`
    insert into invitations ("listId", "inviterId", "invitedEmailNormalized", role, status, "secretHash", "expiresAt")
    values (
      ${input.listId},
      ${input.inviterId},
      ${input.invitedEmail},
      'collaborator',
      ${status},
      ${"hash-" + Math.random()},
      now() + interval '7 days'
    )
    returning id
  `;

  return result.rows[0]!.id as number;
}

describe("searchInvitableUsers", () => {
  // T1: Contract 1b.1 — accepted collaborator (collaborator role) excluded
  it("T1: excludes a user who is already an accepted collaborator on the list", async () => {
    const suffix = Date.now();
    const ownerId = await insertUser(
      "SIU Owner T1",
      `siu-owner-t1-${suffix}@example.com`,
    );
    const collaboratorId = await insertUser(
      "SIU Collaborator T1",
      `siu-collab-t1-${suffix}@example.com`,
    );
    const listId = await insertList("SIU List T1", ownerId);

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });
    await addCollaboratorRow({ listId, userId: collaboratorId, role: "collaborator" });

    const { searchInvitableUsers } = await importCollaboratorActions();

    const results = await searchInvitableUsers(`siu-collab-t1-${suffix}`, listId as never);

    const ids = results.map((u) => Number(u.id));
    expect(ids).not.toContain(Number(collaboratorId));
  });

  // T2: Contract 1b.1 edge — owner role is also excluded
  it("T2: excludes a user with owner role on the list", async () => {
    const suffix = Date.now();
    const ownerId = await insertUser(
      "SIU Owner T2",
      `siu-owner-t2-${suffix}@example.com`,
    );
    const listId = await insertList("SIU List T2", ownerId);

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });

    const { searchInvitableUsers } = await importCollaboratorActions();

    const results = await searchInvitableUsers(`siu-owner-t2-${suffix}`, listId as never);

    const ids = results.map((u) => Number(u.id));
    expect(ids).not.toContain(Number(ownerId));
  });

  // T3: Contract 1b.2 — user with sent invitation excluded
  it("T3: excludes a user whose email has a status=sent invitation on the list", async () => {
    const suffix = Date.now();
    const ownerId = await insertUser(
      "SIU Owner T3",
      `siu-owner-t3-${suffix}@example.com`,
    );
    const invitedUserId = await insertUser(
      "SIU Invited T3",
      `siu-invited-t3-${suffix}@example.com`,
    );
    const listId = await insertList("SIU List T3", ownerId);

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });
    await insertOpenInvitation({
      listId,
      inviterId: ownerId,
      invitedEmail: `siu-invited-t3-${suffix}@example.com`,
      status: "sent",
    });

    const { searchInvitableUsers } = await importCollaboratorActions();

    const results = await searchInvitableUsers(`siu-invited-t3-${suffix}`, listId as never);

    const ids = results.map((u) => Number(u.id));
    expect(ids).not.toContain(Number(invitedUserId));
  });

  // T4: Contract 1b.3 — user with pending invitation excluded
  it("T4: excludes a user whose email has a status=pending invitation on the list", async () => {
    const suffix = Date.now();
    const ownerId = await insertUser(
      "SIU Owner T4",
      `siu-owner-t4-${suffix}@example.com`,
    );
    const pendingUserId = await insertUser(
      "SIU Pending T4",
      `siu-pending-t4-${suffix}@example.com`,
    );
    const listId = await insertList("SIU List T4", ownerId);

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });
    await insertOpenInvitation({
      listId,
      inviterId: ownerId,
      invitedEmail: `siu-pending-t4-${suffix}@example.com`,
      status: "pending",
    });

    const { searchInvitableUsers } = await importCollaboratorActions();

    const results = await searchInvitableUsers(`siu-pending-t4-${suffix}`, listId as never);

    const ids = results.map((u) => Number(u.id));
    expect(ids).not.toContain(Number(pendingUserId));
  });

  // T5: Contract 1b.4 — unconnected user appears in results
  it("T5: returns a user with no collaborator row and no open invitation for the list", async () => {
    const suffix = Date.now();
    const ownerId = await insertUser(
      "SIU Owner T5",
      `siu-owner-t5-${suffix}@example.com`,
    );
    const unconnectedId = await insertUser(
      "SIU Unconnected T5",
      `siu-unconnected-t5-${suffix}@example.com`,
    );
    const listId = await insertList("SIU List T5", ownerId);

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });

    const { searchInvitableUsers } = await importCollaboratorActions();

    const results = await searchInvitableUsers(`siu-unconnected-t5-${suffix}`, listId as never);

    const ids = results.map((u) => Number(u.id));
    expect(ids).toContain(Number(unconnectedId));
  });

  // T6: Contract 1b.5 — single DB query
  it("T6: executes exactly one database query", async () => {
    const suffix = Date.now();
    const ownerId = await insertUser(
      "SIU Owner T6",
      `siu-owner-t6-${suffix}@example.com`,
    );
    const listId = await insertList("SIU List T6", ownerId);

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });

    const { searchInvitableUsers, getQueryCount } =
      await importCollaboratorActionsWithQueryCounter();

    await searchInvitableUsers(`siu-t6-${suffix}`, listId as never);

    expect(getQueryCount()).toBe(1);
  });

  // Blank search term returns empty array
  it("returns empty array for blank search term", async () => {
    const suffix = Date.now();
    const ownerId = await insertUser(
      "SIU Owner Blank",
      `siu-owner-blank-${suffix}@example.com`,
    );
    const listId = await insertList("SIU List Blank", ownerId);

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });

    const { searchInvitableUsers } = await importCollaboratorActions();

    const results = await searchInvitableUsers("   ", listId as never);

    expect(results).toEqual([]);
  });
});
