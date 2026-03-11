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

  return import("../../../lib/invitations/service");
}

async function importInvitationServicesWithQueryCounter() {
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
      await vi.importActual<typeof import("@vercel/postgres")>(
        "@vercel/postgres",
      );

    return {
      ...actual,
      sql: countedSql,
    };
  });

  const invitationServices = await import("../../../lib/invitations/service");

  return {
    ...invitationServices,
    getQueryCount: () => queryCount,
  };
}

async function importInvitationHelpers() {
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

  const emailService = await import("../../../lib/email/service");
  const tokenService = await import("../../../lib/invitations/token");

  return {
    ...emailService,
    ...tokenService,
  };
}

async function importInvitationActions() {
  const client = getIntegrationSqlClient();

  vi.resetModules();
  vi.doMock("@/auth", () => ({
    auth: vi.fn().mockResolvedValue(null),
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

async function importInvitationActionsWithHelpers() {
  const client = getIntegrationSqlClient();

  vi.resetModules();
  vi.doMock("@/auth", () => ({
    auth: vi.fn().mockResolvedValue(null),
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

  const invitationActions = await import(
    "../../../app/lists/_actions/invitations"
  );
  const emailService = await import("../../../lib/email/service");
  const tokenService = await import("../../../lib/invitations/token");

  return {
    ...invitationActions,
    ...emailService,
    ...tokenService,
  };
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

async function insertPendingApprovalInvitation(input: {
  listId: number;
  inviterId: User["id"];
  invitedEmail: string;
  acceptedByUserId: User["id"];
  acceptedByEmail?: string | null;
}) {
  const client = getIntegrationSqlClient();
  const result = await client.sql<{ id: number }>`
    insert into invitations ("listId", "inviterId", "invitedEmailNormalized", role, status, "secretHash", "expiresAt", "acceptedByUserId", "acceptedByEmail")
    values (
      ${input.listId},
      ${input.inviterId},
      ${input.invitedEmail},
      'collaborator',
      'pending_approval',
      ${"hash-" + Math.random()},
      now() + interval '7 days',
      ${input.acceptedByUserId},
      ${input.acceptedByEmail ?? null}
    )
    returning id
  `;

  return result.rows[0]!.id as number;
}

async function findCollaboratorRows(listId: number) {
  const client = getIntegrationSqlClient();
  const result = await client.sql<{
    listId: number;
    userId: number;
    role: string;
  }>`
    select "listId", "userId", role
    from list_collaborators
    where "listId" = ${listId}
    order by "userId"
  `;
  return result.rows;
}

async function findInvitationRow(invitationId: number) {
  const client = getIntegrationSqlClient();
  const result = await client.sql<{
    id: number;
    status: string;
    resolvedAt: string | null;
  }>`
    select id, status, "resolvedAt"
    from invitations
    where id = ${invitationId}
  `;
  return result.rows[0] ?? null;
}

async function findInvitationDetails(invitationId: number) {
  const client = getIntegrationSqlClient();
  const result = await client.sql<{
    id: number;
    status: string;
    secretHash: string;
    providerMessageId: string | null;
    lastDeliveryAttemptAt: string | null;
  }>`
    select id, status, "secretHash", "providerMessageId", "lastDeliveryAttemptAt"
    from invitations
    where id = ${invitationId}
  `;

  return result.rows[0] ?? null;
}

async function snapshotManagementState(listId: number) {
  const client = getIntegrationSqlClient();
  const [collaborators, invitations] = await Promise.all([
    client.sql<{
      listId: number;
      userId: number;
      role: string;
    }>`
      select "listId", "userId", role
      from list_collaborators
      where "listId" = ${listId}
      order by "userId", role
    `,
    client.sql<{
      id: number;
      status: string;
      invitedEmailNormalized: string | null;
      acceptedByUserId: number | null;
      acceptedByEmail: string | null;
    }>`
      select id, status, "invitedEmailNormalized", "acceptedByUserId", "acceptedByEmail"
      from invitations
      where "listId" = ${listId}
      order by id
    `,
  ]);

  return {
    collaborators: collaborators.rows,
    invitations: invitations.rows,
  };
}

describe("Phase 8: assertCanManageCollaborators (Contract 8.2)", () => {
  it("allows owner actors to pass the management permission check without mutating state", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Manage Owner",
      `phase8-manage-owner-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Management list", ownerId);

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });

    const { assertCanManageCollaborators } = await importPermissionsActions();

    await expect(
      assertCanManageCollaborators({
        listId: listId as never,
        actorId: ownerId,
      }),
    ).resolves.toBeUndefined();
  });

  it("raises CollaboratorManagementPermissionDeniedError for non-owners", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Management List Owner",
      `phase8-perm-owner-${emailSuffix}@example.com`,
    );
    const nonOwnerId = await insertUser(
      "Non-Owner",
      `phase8-perm-nonowner-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Non-owner management list", ownerId);

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });
    await addCollaboratorRow({
      listId,
      userId: nonOwnerId,
      role: "collaborator",
    });

    const { assertCanManageCollaborators } = await importPermissionsActions();

    await expect(
      assertCanManageCollaborators({
        listId: listId as never,
        actorId: nonOwnerId,
      }),
    ).rejects.toMatchObject({
      name: "CollaboratorManagementPermissionDeniedError",
    });
  });

  it("raises CollaboratorManagementPermissionDeniedError for users not on the list", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Perm Owner",
      `phase8-perm-owner2-${emailSuffix}@example.com`,
    );
    const outsiderId = await insertUser(
      "Outsider",
      `phase8-outsider-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Permission check list", ownerId);

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });

    const { assertCanManageCollaborators } = await importPermissionsActions();

    await expect(
      assertCanManageCollaborators({
        listId: listId as never,
        actorId: outsiderId,
      }),
    ).rejects.toMatchObject({
      name: "CollaboratorManagementPermissionDeniedError",
    });
  });

  it("does not mutate collaborator or invitation state", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Mutation Guard Owner",
      `phase8-mutation-owner-${emailSuffix}@example.com`,
    );
    const pendingUserId = await insertUser(
      "Mutation Guard Pending",
      `phase8-mutation-pending-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Mutation guard list", ownerId);

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });
    await insertPendingApprovalInvitation({
      listId,
      inviterId: ownerId,
      invitedEmail: `phase8-mutation-invited-${emailSuffix}@example.com`,
      acceptedByUserId: pendingUserId,
      acceptedByEmail: `phase8-mutation-pending-${emailSuffix}@example.com`,
    });

    const before = await snapshotManagementState(listId);
    const { assertCanManageCollaborators } = await importPermissionsActions();

    await expect(
      assertCanManageCollaborators({
        listId: listId as never,
        actorId: ownerId,
      }),
    ).resolves.toBeUndefined();

    const after = await snapshotManagementState(listId);
    expect(after).toEqual(before);
  });
});

describe("Phase 8: loadCollaboratorManagementWorkflow (Contract 8.1)", () => {
  it("returns only manageable lists and includes action-driving invitation data", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Workflow Owner",
      `phase8-workflow-owner-${emailSuffix}@example.com`,
    );
    const otherOwnerId = await insertUser(
      "Workflow Other Owner",
      `phase8-workflow-other-owner-${emailSuffix}@example.com`,
    );
    const collaboratorId = await insertUser(
      "Workflow Collaborator",
      `phase8-workflow-collab-${emailSuffix}@example.com`,
    );
    const pendingUserId = await insertUser(
      "Workflow Pending User",
      `phase8-workflow-pending-${emailSuffix}@example.com`,
    );
    const manageableListId = await insertList("Workflow list", ownerId);
    const otherListId = await insertList("Workflow hidden list", otherOwnerId);

    await addCollaboratorRow({ listId: manageableListId, userId: ownerId, role: "owner" });
    await addCollaboratorRow({
      listId: manageableListId,
      userId: collaboratorId,
      role: "collaborator",
    });
    await addCollaboratorRow({ listId: otherListId, userId: otherOwnerId, role: "owner" });

    const sentInvitationId = await insertOpenInvitation({
      listId: manageableListId,
      inviterId: ownerId,
      invitedEmail: `phase8-workflow-open-${emailSuffix}@example.com`,
      status: "sent",
    });
    const pendingInvitationId = await insertPendingApprovalInvitation({
      listId: manageableListId,
      inviterId: ownerId,
      invitedEmail: `phase8-workflow-invited-${emailSuffix}@example.com`,
      acceptedByUserId: pendingUserId,
      acceptedByEmail: `phase8-workflow-pending-${emailSuffix}@example.com`,
    });

    const { loadCollaboratorManagementWorkflow } =
      await importInvitationServices();

    const result = await loadCollaboratorManagementWorkflow({
      actorId: ownerId,
    });

    expect(result.manageableLists).toHaveLength(1);
    const listView = result.manageableLists[0]!;
    expect(Number(listView.list.id)).toBe(manageableListId);
    expect(Number(listView.list.id)).not.toBe(otherListId);
    expect(
      listView.acceptedCollaborators.some(
        (collaborator) => Number(collaborator.userId) === Number(collaboratorId),
      ),
    ).toBe(true);

    const sentInvitation = listView.invitations.find(
      (invitation) => Number(invitation.invitationId) === sentInvitationId,
    );
    expect(sentInvitation).toMatchObject({
      kind: "sent",
      invitationId: sentInvitationId,
    });

    const pendingInvitation = listView.invitations.find(
      (invitation) => Number(invitation.invitationId) === pendingInvitationId,
    );
    expect(pendingInvitation).toMatchObject({
      kind: "pending_approval",
      invitationId: pendingInvitationId,
      acceptedByUserId: pendingUserId,
      acceptedByEmail: `phase8-workflow-pending-${emailSuffix}@example.com`,
    });
  });
});

describe("Phase 8: getCollaboratorManagementViewData (Contract 8.3)", () => {
  it("returns accepted collaborators, open invites, and pending_approval entries", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "View Data Owner",
      `phase8-viewdata-owner-${emailSuffix}@example.com`,
    );
    const collaboratorId = await insertUser(
      "View Data Collab",
      `phase8-viewdata-collab-${emailSuffix}@example.com`,
    );
    const pendingApprovalUserId = await insertUser(
      "Pending Approval User",
      `phase8-viewdata-pending-${emailSuffix}@example.com`,
    );
    const listId = await insertList("View data list", ownerId);

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });
    await addCollaboratorRow({
      listId,
      userId: collaboratorId,
      role: "collaborator",
    });

    await insertOpenInvitation({
      listId,
      inviterId: ownerId,
      invitedEmail: `phase8-open-invite-${emailSuffix}@example.com`,
      status: "sent",
    });

    await insertPendingApprovalInvitation({
      listId,
      inviterId: ownerId,
      invitedEmail: `phase8-invited-email-${emailSuffix}@example.com`,
      acceptedByUserId: pendingApprovalUserId,
      acceptedByEmail: `phase8-viewdata-pending-${emailSuffix}@example.com`,
    });

    const { getCollaboratorManagementViewData } =
      await importInvitationServices();

    const result = await getCollaboratorManagementViewData({
      actorId: ownerId,
    });

    expect(result.manageableLists).toHaveLength(1);
    const listView = result.manageableLists[0]!;
    expect(listView.list.id).toBe(listId);

    // Accepted collaborators
    expect(listView.acceptedCollaborators.length).toBeGreaterThanOrEqual(2);
    const ownerCollab = listView.acceptedCollaborators.find(
      (c) => Number(c.userId) === Number(ownerId),
    );
    const regularCollab = listView.acceptedCollaborators.find(
      (c) => Number(c.userId) === Number(collaboratorId),
    );
    expect(ownerCollab).toBeDefined();
    expect(regularCollab).toBeDefined();

    // Open invitations
    const openInvites = listView.invitations.filter((i) => i.kind === "sent");
    expect(openInvites.length).toBeGreaterThanOrEqual(1);

    // Pending approval
    const pendingApproval = listView.invitations.filter(
      (i) => i.kind === "pending_approval",
    );
    expect(pendingApproval.length).toBeGreaterThanOrEqual(1);
    const pendingEntry = pendingApproval[0]!;
    if (pendingEntry.kind === "pending_approval") {
      expect(Number(pendingEntry.acceptedByUserId)).toBe(
        Number(pendingApprovalUserId),
      );
      expect(pendingEntry.acceptedByEmail).toBeTruthy();
    }
  });

  it("excludes lists where actor is not an owner", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Exclude Test Owner",
      `phase8-exclude-owner-${emailSuffix}@example.com`,
    );
    const nonOwnerId = await insertUser(
      "Exclude Non-Owner",
      `phase8-exclude-nonowner-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Excluded list", ownerId);

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });
    await addCollaboratorRow({
      listId,
      userId: nonOwnerId,
      role: "collaborator",
    });

    const { getCollaboratorManagementViewData } =
      await importInvitationServices();

    const result = await getCollaboratorManagementViewData({
      actorId: nonOwnerId,
    });

    // Non-owner should not see any manageable lists from this list
    const foundList = result.manageableLists.find(
      (l) => Number(l.list.id) === listId,
    );
    expect(foundList).toBeUndefined();
  });

  it("returns only lists the actor owns when they own some but not all", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Partial Owner",
      `phase8-partial-owner-${emailSuffix}@example.com`,
    );
    const otherOwnerId = await insertUser(
      "Other Owner",
      `phase8-other-owner-${emailSuffix}@example.com`,
    );
    const ownedListId = await insertList("Owned list", ownerId);
    const unownedListId = await insertList("Unowned list", otherOwnerId);

    await addCollaboratorRow({
      listId: ownedListId,
      userId: ownerId,
      role: "owner",
    });
    await addCollaboratorRow({
      listId: unownedListId,
      userId: otherOwnerId,
      role: "owner",
    });
    // ownerId is a collaborator (not owner) on the unowned list
    await addCollaboratorRow({
      listId: unownedListId,
      userId: ownerId,
      role: "collaborator",
    });

    const { getCollaboratorManagementViewData } =
      await importInvitationServices();

    const result = await getCollaboratorManagementViewData({
      actorId: ownerId,
    });

    const returnedListIds = result.manageableLists.map((l) => Number(l.list.id));
    expect(returnedListIds).toContain(ownedListId);
    expect(returnedListIds).not.toContain(unownedListId);
  });

  it("returns empty manageableLists when actor owns no lists", async () => {
    const emailSuffix = Date.now();
    const nonOwnerId = await insertUser(
      "No Lists User",
      `phase8-nolists-${emailSuffix}@example.com`,
    );

    const { getCollaboratorManagementViewData } =
      await importInvitationServices();

    const result = await getCollaboratorManagementViewData({
      actorId: nonOwnerId,
    });

    expect(result.manageableLists).toHaveLength(0);
  });

  it("preserves authoritative invitationId identifiers for action dispatch", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Auth ID Owner",
      `phase8-authid-owner-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Auth ID list", ownerId);

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });

    const invitationId = await insertOpenInvitation({
      listId,
      inviterId: ownerId,
      invitedEmail: `phase8-authid-invitee-${emailSuffix}@example.com`,
      status: "sent",
    });

    const { getCollaboratorManagementViewData } =
      await importInvitationServices();

    const result = await getCollaboratorManagementViewData({
      actorId: ownerId,
    });

    const listView = result.manageableLists.find(
      (l) => Number(l.list.id) === listId,
    );
    expect(listView).toBeDefined();
    const invitation = listView!.invitations.find(
      (i) => Number(i.invitationId) === invitationId,
    );
    expect(invitation).toBeDefined();
    expect(Number(invitation!.invitationId)).toBe(invitationId);
  });

  it("uses a bounded number of queries as manageable lists grow", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Bounded Query Owner",
      `phase8-query-owner-${emailSuffix}@example.com`,
    );

    for (let index = 0; index < 3; index += 1) {
      const listId = await insertList(`Bounded query list ${index}`, ownerId);
      await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });
      await insertOpenInvitation({
        listId,
        inviterId: ownerId,
        invitedEmail: `phase8-query-open-${index}-${emailSuffix}@example.com`,
      });
    }

    const { getCollaboratorManagementViewData, getQueryCount } =
      await importInvitationServicesWithQueryCounter();

    const result = await getCollaboratorManagementViewData({
      actorId: ownerId,
    });

    expect(result.manageableLists).toHaveLength(3);
    expect(getQueryCount()).toBe(3);
  });
});

describe("Phase 8: approveInvitation / rejectInvitation (Contract 8.6)", () => {
  it("approveInvitation atomically transitions pending_approval to accepted and inserts list_collaborators row", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Approve Owner",
      `phase8-approve-owner-${emailSuffix}@example.com`,
    );
    const pendingUserId = await insertUser(
      "Pending User",
      `phase8-approve-pending-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Approve list", ownerId);

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });

    const invitationId = await insertPendingApprovalInvitation({
      listId,
      inviterId: ownerId,
      invitedEmail: `phase8-approve-invited-${emailSuffix}@example.com`,
      acceptedByUserId: pendingUserId,
      acceptedByEmail: `phase8-approve-pending-${emailSuffix}@example.com`,
    });

    const collaboratorsBefore = await findCollaboratorRows(listId);
    expect(
      collaboratorsBefore.find((c) => c.userId === Number(pendingUserId)),
    ).toBeUndefined();

    const { approveInvitation } = await importInvitationActions();
    const now = new Date();
    await approveInvitation({
      invitationId: invitationId as never,
      actorId: ownerId,
      now,
    });

    const invRow = await findInvitationRow(invitationId);
    expect(invRow?.status).toBe("accepted");
    expect(invRow?.resolvedAt).toBeTruthy();

    const collaboratorsAfter = await findCollaboratorRows(listId);
    const newCollab = collaboratorsAfter.find(
      (c) => c.userId === Number(pendingUserId),
    );
    expect(newCollab).toBeDefined();
    expect(newCollab?.role).toBe("collaborator");
  });

  it("rejectInvitation transitions pending_approval to revoked without creating list_collaborators row", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Reject Owner",
      `phase8-reject-owner-${emailSuffix}@example.com`,
    );
    const pendingUserId = await insertUser(
      "Reject Pending User",
      `phase8-reject-pending-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Reject list", ownerId);

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });

    const invitationId = await insertPendingApprovalInvitation({
      listId,
      inviterId: ownerId,
      invitedEmail: `phase8-reject-invited-${emailSuffix}@example.com`,
      acceptedByUserId: pendingUserId,
      acceptedByEmail: `phase8-reject-pending-${emailSuffix}@example.com`,
    });

    const { rejectInvitation } = await importInvitationActions();
    const now = new Date();
    await rejectInvitation({
      invitationId: invitationId as never,
      actorId: ownerId,
      now,
    });

    const invRow = await findInvitationRow(invitationId);
    expect(invRow?.status).toBe("revoked");
    expect(invRow?.resolvedAt).toBeTruthy();

    const collaboratorsAfter = await findCollaboratorRows(listId);
    const rejectedCollab = collaboratorsAfter.find(
      (c) => c.userId === Number(pendingUserId),
    );
    expect(rejectedCollab).toBeUndefined();
  });

  it("revokeInvitation transitions a sent invitation to revoked", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Revoke Owner",
      `phase8-revoke-owner-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Revoke list", ownerId);

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });

    const invitationId = await insertOpenInvitation({
      listId,
      inviterId: ownerId,
      invitedEmail: `phase8-revoke-invitee-${emailSuffix}@example.com`,
      status: "sent",
    });

    const { revokeInvitation } = await importInvitationActions();
    const now = new Date();
    await revokeInvitation({
      invitationId: invitationId as never,
      actorId: ownerId,
      now,
    });

    const invRow = await findInvitationRow(invitationId);
    expect(invRow?.status).toBe("revoked");
    expect(invRow?.resolvedAt).toBeTruthy();
  });

  it("resendInvitation rotates the authoritative secret and records a fresh delivery attempt", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Resend Owner",
      `phase8-resend-owner-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Resend list", ownerId);
    const originalSecretHash = `original-hash-${emailSuffix}`;

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });

    const invitationId = await insertOpenInvitation({
      listId,
      inviterId: ownerId,
      invitedEmail: `phase8-resend-invitee-${emailSuffix}@example.com`,
      status: "sent",
    });

    const client = getIntegrationSqlClient();
    await client.sql`
      update invitations
      set "secretHash" = ${originalSecretHash}
      where id = ${invitationId}
    `;

    const { resendInvitation, hashInvitationSecret, setEmailServiceForTesting } =
      await importInvitationActionsWithHelpers();
    const emailSendSpy = vi.fn().mockResolvedValue({
      kind: "accepted",
      providerMessageId: "provider-resend" as never,
    });

    setEmailServiceForTesting({
      sendInvitationEmail: emailSendSpy,
    });
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("EMAIL_FROM", "owner@example.com");
    vi.stubEnv("APP_BASE_URL", "https://example.com");

    await resendInvitation({
      invitationId: invitationId as never,
      actorId: ownerId,
      now: new Date("2026-03-11T23:00:00.000Z"),
    });

    expect(emailSendSpy).toHaveBeenCalledTimes(1);
    const sentAcceptanceUrl = emailSendSpy.mock.calls[0]?.[0]?.acceptanceUrl;
    const token = new URL(sentAcceptanceUrl).searchParams.get("token");
    const invitation = await findInvitationDetails(invitationId);

    expect(token).toBeTruthy();
    expect(invitation?.status).toBe("sent");
    expect(invitation?.providerMessageId).toBe("provider-resend");
    expect(invitation?.lastDeliveryAttemptAt).toBeTruthy();
    expect(invitation?.secretHash).toBe(hashInvitationSecret(token as never));
    expect(invitation?.secretHash).not.toBe(originalSecretHash);
  });

  it("copyInvitationLink rotates the authoritative secret and returns the latest acceptance URL without sending email", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Copy Link Owner",
      `phase8-copy-owner-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Copy link list", ownerId);
    const originalSecretHash = `copy-link-hash-${emailSuffix}`;

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });

    const invitationId = await insertOpenInvitation({
      listId,
      inviterId: ownerId,
      invitedEmail: `phase8-copy-invitee-${emailSuffix}@example.com`,
      status: "sent",
    });

    const client = getIntegrationSqlClient();
    await client.sql`
      update invitations
      set "secretHash" = ${originalSecretHash}
      where id = ${invitationId}
    `;

    const { copyInvitationLink } = await importInvitationActions();
    const { hashInvitationSecret } = await importInvitationHelpers();
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("EMAIL_FROM", "owner@example.com");
    vi.stubEnv("APP_BASE_URL", "https://example.com/app");

    const result = await copyInvitationLink({
      invitationId: invitationId as never,
      actorId: ownerId,
      now: new Date("2026-03-12T00:00:00.000Z"),
    });
    const token = new URL(result.acceptanceUrl).searchParams.get("token");
    const invitation = await findInvitationDetails(invitationId);

    expect(result.acceptanceUrl).toMatch(
      /^https:\/\/example\.com\/invite\?token=/,
    );
    expect(token).toBeTruthy();
    expect(invitation?.status).toBe("sent");
    expect(invitation?.secretHash).toBe(hashInvitationSecret(token as never));
    expect(invitation?.secretHash).not.toBe(originalSecretHash);
    expect(invitation?.providerMessageId).toBeNull();
  });
});
