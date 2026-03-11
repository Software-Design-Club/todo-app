import type { AuthenticatedUser, User } from "@/lib/types";
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
    ...(await import("../../../lib/invitations/token")),
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

async function insertInvitation(input: {
  listId: number;
  inviterId: number;
  email: string;
  secretHash: string;
  status?: string;
  expiresAt?: string;
}) {
  const client = getIntegrationSqlClient();
  const status = input.status ?? "sent";
  const expiresAt = input.expiresAt ?? "2026-04-01 00:00:00";
  const isOpen = status === "pending" || status === "sent";
  const needsResolvedAt =
    status === "revoked" ||
    status === "expired" ||
    status === "accepted" ||
    status === "pending_approval";
  const resolvedAt = needsResolvedAt && !isOpen ? "2026-03-10 00:00:00" : null;
  const acceptedByUserId =
    status === "accepted" || status === "pending_approval"
      ? input.inviterId
      : null;

  const result = await client.sql<{ id: number }>`
    insert into invitations (
      "listId", "inviterId", "invitedEmailNormalized", role, status,
      "secretHash", "expiresAt", "acceptedByUserId", "resolvedAt"
    )
    values (
      ${input.listId}, ${input.inviterId}, ${input.email}, 'collaborator', ${status},
      ${input.secretHash}, ${expiresAt}::timestamp, ${acceptedByUserId}, ${resolvedAt}::timestamp
    )
    returning id
  `;

  return result.rows[0]!.id;
}

async function findCollaboratorRows(listId: number, userId: number) {
  const client = getIntegrationSqlClient();
  const result = await client.sql<{
    id: number;
    listId: number;
    userId: number;
    role: string;
  }>`
    select id, "listId", "userId", role
    from list_collaborators
    where "listId" = ${listId} and "userId" = ${userId}
  `;

  return result.rows;
}

async function findInvitationById(id: number) {
  const client = getIntegrationSqlClient();
  const result = await client.sql<{
    id: number;
    status: string;
    acceptedByUserId: number | null;
    acceptedByEmail: string | null;
    resolvedAt: string | null;
  }>`
    select id, status, "acceptedByUserId", "acceptedByEmail", "resolvedAt"
    from invitations
    where id = ${id}
  `;

  return result.rows[0] ?? null;
}

describe("Phase 6 invitation acceptance", () => {
  it("resolveInviteAcceptance: matching email produces accepted + list_collaborators row", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Accept Owner",
      `phase6-accept-owner-${emailSuffix}@example.com`,
    );
    const inviteeId = await insertUser(
      "Accept Invitee",
      `phase6-accept-invitee-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Accept list", ownerId);
    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });

    const { resolveInviteAcceptance, hashInvitationSecret } =
      await importInvitationServices();

    const secret = `matching-secret-${emailSuffix}` as never;
    const secretHash = hashInvitationSecret(secret);

    await insertInvitation({
      listId,
      inviterId: Number(ownerId),
      email: `phase6-accept-invitee-${emailSuffix}@example.com`,
      secretHash,
      status: "sent",
      expiresAt: "2026-04-01 00:00:00",
    });

    const viewer: AuthenticatedUser = {
      id: inviteeId,
      email: `phase6-accept-invitee-${emailSuffix}@example.com` as never,
      name: "Accept Invitee" as never,
    };

    const result = await resolveInviteAcceptance({
      invitationSecret: secret,
      viewer,
      now: new Date("2026-03-11T12:00:00.000Z"),
    });

    expect(result).toMatchObject({ kind: "accepted", listId });

    const collaboratorRows = await findCollaboratorRows(
      listId,
      Number(inviteeId),
    );
    expect(collaboratorRows).toHaveLength(1);
    expect(collaboratorRows[0]).toMatchObject({
      listId,
      userId: Number(inviteeId),
      role: "collaborator",
    });
  });

  it("resolveInviteAcceptance: mismatched email produces pending_approval, no list_collaborators", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Mismatch Owner",
      `phase6-mismatch-owner-${emailSuffix}@example.com`,
    );
    const mismatchUserId = await insertUser(
      "Mismatch User",
      `phase6-mismatch-user-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Mismatch list", ownerId);
    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });

    const { resolveInviteAcceptance, hashInvitationSecret } =
      await importInvitationServices();

    const secret = `mismatch-secret-${emailSuffix}` as never;
    const secretHash = hashInvitationSecret(secret);

    const invitationId = await insertInvitation({
      listId,
      inviterId: Number(ownerId),
      email: `phase6-invited-${emailSuffix}@example.com`,
      secretHash,
      status: "sent",
      expiresAt: "2026-04-01 00:00:00",
    });

    const viewer: AuthenticatedUser = {
      id: mismatchUserId,
      email: `phase6-mismatch-user-${emailSuffix}@example.com` as never,
      name: "Mismatch User" as never,
    };

    const result = await resolveInviteAcceptance({
      invitationSecret: secret,
      viewer,
      now: new Date("2026-03-11T12:00:00.000Z"),
    });

    expect(result).toMatchObject({ kind: "pending_approval", listId });

    const collaboratorRows = await findCollaboratorRows(
      listId,
      Number(mismatchUserId),
    );
    expect(collaboratorRows).toHaveLength(0);

    const updatedInvitation = await findInvitationById(invitationId);
    expect(updatedInvitation).toMatchObject({
      status: "pending_approval",
      acceptedByUserId: Number(mismatchUserId),
      acceptedByEmail: `phase6-mismatch-user-${emailSuffix}@example.com`,
    });
  });

  it("resolveInviteAcceptance: unknown secret produces invalid", async () => {
    const { resolveInviteAcceptance } = await importInvitationServices();
    const unknownSecret = `unknown-secret-${Date.now()}` as never;

    const viewer: AuthenticatedUser = {
      id: 99999 as never,
      email: "nobody@example.com" as never,
      name: "Nobody" as never,
    };

    const result = await resolveInviteAcceptance({
      invitationSecret: unknownSecret,
      viewer,
      now: new Date("2026-03-11T12:00:00.000Z"),
    });

    expect(result).toEqual({ kind: "invalid" });
  });

  it("resolveInviteAcceptance: expired invitation produces expired", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Expired Owner",
      `phase6-expired-owner-${emailSuffix}@example.com`,
    );
    const inviteeId = await insertUser(
      "Expired Invitee",
      `phase6-expired-invitee-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Expired list", ownerId);
    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });

    const { resolveInviteAcceptance, hashInvitationSecret } =
      await importInvitationServices();

    const secret = `expired-secret-${emailSuffix}` as never;
    const secretHash = hashInvitationSecret(secret);

    await insertInvitation({
      listId,
      inviterId: Number(ownerId),
      email: `phase6-expired-invitee-${emailSuffix}@example.com`,
      secretHash,
      status: "sent",
      expiresAt: "2026-03-01 00:00:00",
    });

    const viewer: AuthenticatedUser = {
      id: inviteeId,
      email: `phase6-expired-invitee-${emailSuffix}@example.com` as never,
      name: "Expired Invitee" as never,
    };

    const result = await resolveInviteAcceptance({
      invitationSecret: secret,
      viewer,
      now: new Date("2026-03-11T12:00:00.000Z"),
    });

    expect(result).toEqual({ kind: "expired" });
  });

  it("resolveInviteAcceptance: revoked invitation produces revoked", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Revoked Owner",
      `phase6-revoked-owner-${emailSuffix}@example.com`,
    );
    const inviteeId = await insertUser(
      "Revoked Invitee",
      `phase6-revoked-invitee-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Revoked list", ownerId);
    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });

    const { resolveInviteAcceptance, hashInvitationSecret } =
      await importInvitationServices();

    const secret = `revoked-secret-${emailSuffix}` as never;
    const secretHash = hashInvitationSecret(secret);

    await insertInvitation({
      listId,
      inviterId: Number(ownerId),
      email: `phase6-revoked-invitee-${emailSuffix}@example.com`,
      secretHash,
      status: "revoked",
      expiresAt: "2026-04-01 00:00:00",
    });

    const viewer: AuthenticatedUser = {
      id: inviteeId,
      email: `phase6-revoked-invitee-${emailSuffix}@example.com` as never,
      name: "Revoked Invitee" as never,
    };

    const result = await resolveInviteAcceptance({
      invitationSecret: secret,
      viewer,
      now: new Date("2026-03-11T12:00:00.000Z"),
    });

    expect(result).toEqual({ kind: "revoked" });
  });

  it("resolveInviteAcceptance: already resolved invitation produces already_resolved", async () => {
    const emailSuffix = Date.now();
    const ownerId = await insertUser(
      "Already Owner",
      `phase6-already-owner-${emailSuffix}@example.com`,
    );
    const inviteeId = await insertUser(
      "Already Invitee",
      `phase6-already-invitee-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Already resolved list", ownerId);
    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });

    const { resolveInviteAcceptance, hashInvitationSecret } =
      await importInvitationServices();

    const secret = `already-resolved-secret-${emailSuffix}` as never;
    const secretHash = hashInvitationSecret(secret);

    await insertInvitation({
      listId,
      inviterId: Number(ownerId),
      email: `phase6-already-invitee-${emailSuffix}@example.com`,
      secretHash,
      status: "accepted",
      expiresAt: "2026-04-01 00:00:00",
    });

    const viewer: AuthenticatedUser = {
      id: inviteeId,
      email: `phase6-already-invitee-${emailSuffix}@example.com` as never,
      name: "Already Invitee" as never,
    };

    const result = await resolveInviteAcceptance({
      invitationSecret: secret,
      viewer,
      now: new Date("2026-03-11T12:00:00.000Z"),
    });

    expect(result).toEqual({ kind: "already_resolved" });
  });

  it("acceptInvitationWorkflow: null viewer produces redirect_to_sign_in", async () => {
    const { acceptInvitationWorkflow } = await importInvitationServices();

    const result = await acceptInvitationWorkflow({
      invitationSecret: "some-secret" as never,
      viewer: null,
      now: new Date("2026-03-11T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      kind: "redirect_to_sign_in",
    });
    if (result.kind === "redirect_to_sign_in") {
      expect(result.redirectTo).toContain("/invite?token=some-secret");
    }
  });
});
