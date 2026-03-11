import { readFile } from "node:fs/promises";
import path from "node:path";

import type { User } from "@/lib/types";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getIntegrationSqlClient } from "../../setup/integration";

const migrationPath = path.join(
  process.cwd(),
  "drizzle",
  "0005_email_invitations.sql",
);

const legacyInvitationColumns = [
  `ALTER TABLE "list_collaborators" ADD COLUMN IF NOT EXISTS "inviteStatus" "invitation_status" DEFAULT 'accepted' NOT NULL`,
  `ALTER TABLE "list_collaborators" ADD COLUMN IF NOT EXISTS "invitedEmailNormalized" text`,
  `ALTER TABLE "list_collaborators" ADD COLUMN IF NOT EXISTS "inviteTokenHash" text`,
  `ALTER TABLE "list_collaborators" ADD COLUMN IF NOT EXISTS "inviteExpiresAt" timestamp`,
  `ALTER TABLE "list_collaborators" ADD COLUMN IF NOT EXISTS "inviterId" integer`,
  `ALTER TABLE "list_collaborators" ADD COLUMN IF NOT EXISTS "inviteSentAt" timestamp`,
  `ALTER TABLE "list_collaborators" ADD COLUMN IF NOT EXISTS "inviteAcceptedAt" timestamp`,
  `ALTER TABLE "list_collaborators" ADD COLUMN IF NOT EXISTS "inviteRevokedAt" timestamp`,
  `ALTER TABLE "list_collaborators" ADD COLUMN IF NOT EXISTS "inviteExpiredAt" timestamp`,
  `ALTER TABLE "list_collaborators" ADD COLUMN IF NOT EXISTS "invitationApprovalRequestedAt" timestamp`,
  `ALTER TABLE "list_collaborators" ADD COLUMN IF NOT EXISTS "invitationApprovedBy" integer`,
  `ALTER TABLE "list_collaborators" ADD COLUMN IF NOT EXISTS "invitationApprovedAt" timestamp`,
  `ALTER TABLE "list_collaborators" ADD COLUMN IF NOT EXISTS "invitationRejectedBy" integer`,
  `ALTER TABLE "list_collaborators" ADD COLUMN IF NOT EXISTS "invitationRejectedAt" timestamp`,
  `ALTER TABLE "list_collaborators" ADD COLUMN IF NOT EXISTS "emailDeliveryStatus" text`,
  `ALTER TABLE "list_collaborators" ADD COLUMN IF NOT EXISTS "emailDeliveryError" text`,
  `ALTER TABLE "list_collaborators" ADD COLUMN IF NOT EXISTS "emailDeliveryProviderId" text`,
  `ALTER TABLE "list_collaborators" ADD COLUMN IF NOT EXISTS "emailLastSentAt" timestamp`,
];

const legacyInvitationColumnNames = [
  "inviteStatus",
  "invitedEmailNormalized",
  "inviteTokenHash",
  "inviteExpiresAt",
  "inviterId",
  "inviteSentAt",
  "inviteAcceptedAt",
  "inviteRevokedAt",
  "inviteExpiredAt",
  "invitationApprovalRequestedAt",
  "invitationApprovedBy",
  "invitationApprovedAt",
  "invitationRejectedBy",
  "invitationRejectedAt",
  "emailDeliveryStatus",
  "emailDeliveryError",
  "emailDeliveryProviderId",
  "emailLastSentAt",
];

async function importCollaboratorsActions() {
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
  vi.doMock("next/cache", () => ({
    revalidatePath: vi.fn(),
  }));

  return import("../../../app/lists/_actions/collaborators");
}

afterEach(() => {
  vi.doUnmock("@vercel/postgres");
  vi.doUnmock("next/cache");
  vi.resetModules();
});

async function executeStatement(statement: string) {
  const client = getIntegrationSqlClient();
  await client.query(statement);
}

async function resetDatabaseToLegacyInvitationSchema() {
  await executeStatement(`DROP TABLE IF EXISTS "invitations" CASCADE`);
  await executeStatement(
    `DROP TYPE IF EXISTS "invitation_delivery_event_type" CASCADE`,
  );
  await executeStatement(`
    DO $$
    BEGIN
      CREATE TYPE "public"."invitation_status" AS ENUM(
        'sent',
        'accepted',
        'pending_approval',
        'revoked',
        'expired'
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await executeStatement(
    `ALTER TABLE "list_collaborators" ALTER COLUMN "userId" DROP NOT NULL`,
  );

  for (const statement of legacyInvitationColumns) {
    await executeStatement(statement);
  }
}

async function applyInvitationMigration() {
  const migrationSql = await readFile(migrationPath, "utf8");
  const statements = migrationSql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  for (const statement of statements) {
    await executeStatement(statement);
  }
}

async function dropLegacyInvitationColumns() {
  for (const columnName of legacyInvitationColumnNames) {
    await executeStatement(
      `ALTER TABLE "list_collaborators" DROP COLUMN IF EXISTS "${columnName}"`,
    );
  }
}

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

async function columnExists(tableName: string, columnName: string) {
  const client = getIntegrationSqlClient();
  const result = await client.sql<{ exists: boolean }>`
    select exists(
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ${tableName}
        and column_name = ${columnName}
    ) as exists
  `;

  return result.rows[0]!.exists;
}

async function getIndexNames(tableName: string) {
  const client = getIntegrationSqlClient();
  const result = await client.sql<{ indexname: string }>`
    select indexname
    from pg_indexes
    where schemaname = 'public' and tablename = ${tableName}
    order by indexname
  `;

  return result.rows.map((row) => row.indexname);
}

describe("Phase 3 schema evolution", () => {
  it("stores open invitation rows with all required fields after migration", async () => {
    const client = getIntegrationSqlClient();
    const emailSuffix = Date.now();
    const creatorId = await insertUser(
      "Invitation Owner",
      `phase3-owner-${emailSuffix}@example.com`,
    );
    const inviterId = await insertUser(
      "Invitation Sender",
      `phase3-inviter-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Invitation schema list", creatorId);

    await resetDatabaseToLegacyInvitationSchema();
    await applyInvitationMigration();

    const result = await client.sql<{
      invitedEmailNormalized: string;
      status: string;
      secretHash: string;
    }>`
      insert into invitations (
        "listId",
        "inviterId",
        "invitedEmailNormalized",
        role,
        status,
        "secretHash",
        "expiresAt"
      )
      values (
        ${listId},
        ${inviterId},
        ${`invitee-${emailSuffix}@example.com`},
        'collaborator',
        'sent',
        ${`secret-hash-${emailSuffix}`},
        timestamp '2030-01-01 00:00:00'
      )
      returning "invitedEmailNormalized", status, "secretHash"
    `;

    expect(result.rows).toEqual([
      {
        invitedEmailNormalized: `invitee-${emailSuffix}@example.com`,
        status: "sent",
        secretHash: `secret-hash-${emailSuffix}`,
      },
    ]);
  });

  it("rejects pending_approval rows without an accepted-by user", async () => {
    const client = getIntegrationSqlClient();
    const emailSuffix = Date.now();
    const creatorId = await insertUser(
      "Pending Approval Owner",
      `phase3-pending-owner-${emailSuffix}@example.com`,
    );
    const inviterId = await insertUser(
      "Pending Approval Sender",
      `phase3-pending-inviter-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Pending approval list", creatorId);

    await resetDatabaseToLegacyInvitationSchema();
    await applyInvitationMigration();

    await expect(
      client.sql`
        insert into invitations (
          "listId",
          "inviterId",
          "invitedEmailNormalized",
          role,
          status,
          "secretHash",
          "expiresAt"
        )
        values (
          ${listId},
          ${inviterId},
          ${`pending-${emailSuffix}@example.com`},
          'collaborator',
          'pending_approval',
          ${`pending-secret-${emailSuffix}`},
          timestamp '2030-02-01 00:00:00'
        )
      `,
    ).rejects.toThrow(/pending_approval_requires_acceptor/);
  });

  it("rejects accepted rows without both acceptedByUserId and resolvedAt", async () => {
    const client = getIntegrationSqlClient();
    const emailSuffix = Date.now();
    const creatorId = await insertUser(
      "Accepted Owner",
      `phase3-accepted-owner-${emailSuffix}@example.com`,
    );
    const inviterId = await insertUser(
      "Accepted Sender",
      `phase3-accepted-inviter-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Accepted constraint list", creatorId);

    await resetDatabaseToLegacyInvitationSchema();
    await applyInvitationMigration();

    await expect(
      client.sql`
        insert into invitations (
          "listId",
          "inviterId",
          "invitedEmailNormalized",
          role,
          status,
          "secretHash",
          "expiresAt",
          "acceptedByUserId"
        )
        values (
          ${listId},
          ${inviterId},
          ${`accepted-${emailSuffix}@example.com`},
          'collaborator',
          'accepted',
          ${`accepted-secret-${emailSuffix}`},
          timestamp '2030-03-01 00:00:00',
          ${creatorId}
        )
      `,
    ).rejects.toThrow(/accepted_requires_acceptor_and_resolved_at/);
  });

  it("rejects terminal rows without a resolvedAt timestamp", async () => {
    const client = getIntegrationSqlClient();
    const emailSuffix = Date.now();
    const creatorId = await insertUser(
      "Terminal Owner",
      `phase3-terminal-owner-${emailSuffix}@example.com`,
    );
    const inviterId = await insertUser(
      "Terminal Sender",
      `phase3-terminal-inviter-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Terminal constraint list", creatorId);

    await resetDatabaseToLegacyInvitationSchema();
    await applyInvitationMigration();

    await expect(
      client.sql`
        insert into invitations (
          "listId",
          "inviterId",
          "invitedEmailNormalized",
          role,
          status,
          "secretHash",
          "expiresAt"
        )
        values (
          ${listId},
          ${inviterId},
          ${`revoked-${emailSuffix}@example.com`},
          'collaborator',
          'revoked',
          ${`revoked-secret-${emailSuffix}`},
          timestamp '2030-04-01 00:00:00'
        )
      `,
    ).rejects.toThrow(/terminal_requires_resolved_at/);
  });

  it("stores acceptedByEmail only when it differs from invitedEmailNormalized", async () => {
    const client = getIntegrationSqlClient();
    const emailSuffix = Date.now();
    const creatorId = await insertUser(
      "Mismatch Owner",
      `phase3-mismatch-owner-${emailSuffix}@example.com`,
    );
    const inviterId = await insertUser(
      "Mismatch Sender",
      `phase3-mismatch-inviter-${emailSuffix}@example.com`,
    );
    const acceptorId = await insertUser(
      "Mismatch Acceptor",
      `phase3-mismatch-acceptor-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Mismatch email list", creatorId);

    await resetDatabaseToLegacyInvitationSchema();
    await applyInvitationMigration();

    const inserted = await client.sql<{ acceptedByEmail: string }>`
      insert into invitations (
        "listId",
        "inviterId",
        "invitedEmailNormalized",
        role,
        status,
        "secretHash",
        "expiresAt",
        "acceptedByUserId",
        "acceptedByEmail"
      )
      values (
        ${listId},
        ${inviterId},
        ${`invite-${emailSuffix}@example.com`},
        'collaborator',
        'pending_approval',
        ${`mismatch-secret-${emailSuffix}`},
        timestamp '2030-05-01 00:00:00',
        ${acceptorId},
        ${`actual-${emailSuffix}@example.com`}
      )
      returning "acceptedByEmail"
    `;

    expect(inserted.rows).toEqual([
      { acceptedByEmail: `actual-${emailSuffix}@example.com` },
    ]);

    await expect(
      client.sql`
        insert into invitations (
          "listId",
          "inviterId",
          "invitedEmailNormalized",
          role,
          status,
          "secretHash",
          "expiresAt",
          "acceptedByUserId",
          "acceptedByEmail"
        )
        values (
          ${listId},
          ${inviterId},
          ${`same-${emailSuffix}@example.com`},
          'collaborator',
          'pending_approval',
          ${`same-secret-${emailSuffix}`},
          timestamp '2030-06-01 00:00:00',
          ${acceptorId},
          ${`same-${emailSuffix}@example.com`}
        )
      `,
    ).rejects.toThrow(/accepted_by_email_tracks_mismatch/);
  });

  it("keeps delivery tracking nullable and independent of invitation status", async () => {
    const client = getIntegrationSqlClient();
    const emailSuffix = Date.now();
    const creatorId = await insertUser(
      "Delivery Owner",
      `phase3-delivery-owner-${emailSuffix}@example.com`,
    );
    const inviterId = await insertUser(
      "Delivery Sender",
      `phase3-delivery-inviter-${emailSuffix}@example.com`,
    );
    const acceptorId = await insertUser(
      "Delivery Acceptor",
      `phase3-delivery-acceptor-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Delivery metadata list", creatorId);

    await resetDatabaseToLegacyInvitationSchema();
    await applyInvitationMigration();

    const inserted = await client.sql<{
      providerMessageId: string | null;
      lastDeliveryError: string | null;
      lastDeliveryAttemptAt: Date | null;
      deliveryEventType: string | null;
    }>`
      insert into invitations (
        "listId",
        "inviterId",
        "invitedEmailNormalized",
        role,
        status,
        "secretHash",
        "expiresAt",
        "acceptedByUserId",
        "resolvedAt"
      )
      values (
        ${listId},
        ${inviterId},
        ${`delivered-${emailSuffix}@example.com`},
        'collaborator',
        'accepted',
        ${`delivery-secret-${emailSuffix}`},
        timestamp '2030-07-01 00:00:00',
        ${acceptorId},
        timestamp '2030-07-02 00:00:00'
      )
      returning
        "providerMessageId",
        "lastDeliveryError",
        "lastDeliveryAttemptAt",
        "deliveryEventType"
    `;

    expect(inserted.rows).toEqual([
      {
        providerMessageId: null,
        lastDeliveryError: null,
        lastDeliveryAttemptAt: null,
        deliveryEventType: null,
      },
    ]);
  });

  it("rejects a second open invitation for the same list and normalized email", async () => {
    const client = getIntegrationSqlClient();
    const emailSuffix = Date.now();
    const creatorId = await insertUser(
      "Unique Owner",
      `phase3-unique-owner-${emailSuffix}@example.com`,
    );
    const inviterId = await insertUser(
      "Unique Sender",
      `phase3-unique-inviter-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Open invite uniqueness list", creatorId);
    const invitedEmail = `duplicate-${emailSuffix}@example.com`;

    await resetDatabaseToLegacyInvitationSchema();
    await applyInvitationMigration();

    await client.sql`
      insert into invitations (
        "listId",
        "inviterId",
        "invitedEmailNormalized",
        role,
        status,
        "secretHash",
        "expiresAt"
      )
      values (
        ${listId},
        ${inviterId},
        ${invitedEmail},
        'collaborator',
        'sent',
        ${`first-secret-${emailSuffix}`},
        timestamp '2030-08-01 00:00:00'
      )
    `;

    await expect(
      client.sql`
        insert into invitations (
          "listId",
          "inviterId",
          "invitedEmailNormalized",
          role,
          status,
          "secretHash",
          "expiresAt"
        )
        values (
          ${listId},
          ${inviterId},
          ${invitedEmail},
          'collaborator',
          'pending',
          ${`second-secret-${emailSuffix}`},
          timestamp '2030-08-02 00:00:00'
        )
      `,
    ).rejects.toThrow(/open_email_unique_idx/);
  });

  it("allows a fresh open invitation after a prior invitation becomes terminal", async () => {
    const client = getIntegrationSqlClient();
    const emailSuffix = Date.now();
    const creatorId = await insertUser(
      "Terminal Reissue Owner",
      `phase3-terminal-reissue-owner-${emailSuffix}@example.com`,
    );
    const inviterId = await insertUser(
      "Terminal Reissue Sender",
      `phase3-terminal-reissue-inviter-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Terminal reissue list", creatorId);
    const invitedEmail = `reissue-${emailSuffix}@example.com`;

    await resetDatabaseToLegacyInvitationSchema();
    await applyInvitationMigration();

    await client.sql`
      insert into invitations (
        "listId",
        "inviterId",
        "invitedEmailNormalized",
        role,
        status,
        "secretHash",
        "expiresAt",
        "resolvedAt"
      )
      values (
        ${listId},
        ${inviterId},
        ${invitedEmail},
        'collaborator',
        'revoked',
        ${`revoked-secret-${emailSuffix}`},
        timestamp '2030-09-01 00:00:00',
        timestamp '2030-09-02 00:00:00'
      )
    `;

    const inserted = await client.sql<{ status: string }>`
      insert into invitations (
        "listId",
        "inviterId",
        "invitedEmailNormalized",
        role,
        status,
        "secretHash",
        "expiresAt"
      )
      values (
        ${listId},
        ${inviterId},
        ${invitedEmail},
        'collaborator',
        'sent',
        ${`fresh-secret-${emailSuffix}`},
        timestamp '2030-09-03 00:00:00'
      )
      returning status
    `;

    expect(inserted.rows).toEqual([{ status: "sent" }]);
  });

  it("preserves list_collaborators uniqueness on listId and userId", async () => {
    const client = getIntegrationSqlClient();
    const emailSuffix = Date.now();
    const creatorId = await insertUser(
      "Collaborator Unique Owner",
      `phase3-collaborator-unique-owner-${emailSuffix}@example.com`,
    );
    const collaboratorId = await insertUser(
      "Collaborator Unique User",
      `phase3-collaborator-unique-user-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Collaborator uniqueness list", creatorId);

    await resetDatabaseToLegacyInvitationSchema();
    await applyInvitationMigration();

    await client.sql`
      insert into list_collaborators ("listId", "userId", role)
      values (${listId}, ${collaboratorId}, 'collaborator')
    `;

    await expect(
      client.sql`
        insert into list_collaborators ("listId", "userId", role)
        values (${listId}, ${collaboratorId}, 'collaborator')
      `,
    ).rejects.toThrow(/list_collaborators_pk/);
  });

  it("keeps getCollaborators limited to accepted collaborators after migration", async () => {
    const emailSuffix = Date.now();
    const creatorId = await insertUser(
      "Read Path Owner",
      `phase3-read-owner-${emailSuffix}@example.com`,
    );
    const collaboratorId = await insertUser(
      "Accepted Collaborator",
      `phase3-read-collaborator-${emailSuffix}@example.com`,
    );
    const inviterId = await insertUser(
      "Read Path Sender",
      `phase3-read-inviter-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Read path list", creatorId);
    const client = getIntegrationSqlClient();

    await resetDatabaseToLegacyInvitationSchema();
    await client.sql`
      insert into list_collaborators ("listId", "userId", role)
      values (${listId}, ${creatorId}, 'owner'), (${listId}, ${collaboratorId}, 'collaborator')
    `;
    await applyInvitationMigration();

    await client.sql`
      insert into invitations (
        "listId",
        "inviterId",
        "invitedEmailNormalized",
        role,
        status,
        "secretHash",
        "expiresAt"
      )
      values (
        ${listId},
        ${inviterId},
        ${`invited-only-${emailSuffix}@example.com`},
        'collaborator',
        'sent',
        ${`read-secret-${emailSuffix}`},
        timestamp '2030-10-01 00:00:00'
      )
    `;

    const { getCollaborators } = await importCollaboratorsActions();
    const collaborators = await getCollaborators(listId as never);

    expect(collaborators).toEqual([
      expect.objectContaining({
        listId,
        Role: "owner",
        User: expect.objectContaining({ id: creatorId }),
      }),
      expect.objectContaining({
        listId,
        Role: "collaborator",
        User: expect.objectContaining({ id: collaboratorId }),
      }),
    ]);
  });

  it("creates the expected invitations indexes", async () => {
    await resetDatabaseToLegacyInvitationSchema();
    await applyInvitationMigration();

    const indexNames = await getIndexNames("invitations");

    expect(indexNames).toEqual(
      expect.arrayContaining([
        "invitations_list_email_status_idx",
        "invitations_list_id_status_idx",
        "invitations_open_email_unique_idx",
        "invitations_secret_hash_idx",
      ]),
    );
  });

  it("migrates legacy invitation rows before dropping legacy columns", async () => {
    const client = getIntegrationSqlClient();
    const emailSuffix = Date.now();
    const creatorId = await insertUser(
      "Migration Owner",
      `phase3-migration-owner-${emailSuffix}@example.com`,
    );
    const inviteeId = await insertUser(
      "Accepted Invitee",
      `phase3-migration-invitee-${emailSuffix}@example.com`,
    );
    const inviterId = await insertUser(
      "Migration Sender",
      `phase3-migration-inviter-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Migration list", creatorId);

    await resetDatabaseToLegacyInvitationSchema();

    await client.sql`
      insert into list_collaborators (
        "listId",
        "userId",
        role,
        "inviteStatus",
        "invitedEmailNormalized",
        "inviteTokenHash",
        "inviteExpiresAt",
        "inviterId",
        "inviteSentAt",
        "inviteAcceptedAt",
        "emailDeliveryStatus",
        "emailDeliveryProviderId",
        "emailLastSentAt"
      )
      values (
        ${listId},
        ${inviteeId},
        'collaborator',
        'accepted',
        ${`legacy-${emailSuffix}@example.com`},
        ${`legacy-hash-${emailSuffix}`},
        timestamp '2030-11-01 00:00:00',
        ${inviterId},
        timestamp '2030-11-02 00:00:00',
        timestamp '2030-11-03 00:00:00',
        'sent',
        ${`provider-${emailSuffix}`},
        timestamp '2030-11-02 00:00:00'
      )
    `;

    await client.sql`
      insert into list_collaborators (
        "listId",
        "userId",
        role,
        "inviteStatus",
        "invitedEmailNormalized",
        "inviteRevokedAt"
      )
      values (
        ${listId},
        null,
        'collaborator',
        'revoked',
        ${`revoked-${emailSuffix}@example.com`},
        timestamp '2030-11-04 00:00:00'
      )
    `;

    await applyInvitationMigration();

    const migratedRows = await client.sql<{
      invitedEmailNormalized: string | null;
      secretHash: string | null;
      providerMessageId: string | null;
      lastDeliveryAttemptAt: Date | null;
      status: string;
      acceptedByUserId: number | null;
      resolvedAt: Date | null;
    }>`
      select
        "invitedEmailNormalized",
        "secretHash",
        "providerMessageId",
        "lastDeliveryAttemptAt",
        status,
        "acceptedByUserId",
        "resolvedAt"
      from invitations
      where "listId" = ${listId}
      order by status, "invitedEmailNormalized"
    `;

    expect(migratedRows.rows).toEqual([
      expect.objectContaining({
        invitedEmailNormalized: `legacy-${emailSuffix}@example.com`,
        secretHash: `legacy-hash-${emailSuffix}`,
        providerMessageId: `provider-${emailSuffix}`,
        status: "accepted",
        acceptedByUserId: inviteeId,
      }),
      expect.objectContaining({
        invitedEmailNormalized: `revoked-${emailSuffix}@example.com`,
        secretHash: null,
        providerMessageId: null,
        status: "revoked",
        acceptedByUserId: null,
      }),
    ]);

    const acceptedCollaborators = await client.sql<{ userId: number }>`
      select "userId"
      from list_collaborators
      where "listId" = ${listId}
      order by "userId"
    `;

    expect(acceptedCollaborators.rows).toEqual([{ userId: inviteeId }]);
    expect(await columnExists("list_collaborators", "inviteTokenHash")).toBe(
      false,
    );
  });

  it("treats missing legacy invitation columns as a migration no-op", async () => {
    const client = getIntegrationSqlClient();
    const emailSuffix = Date.now();
    const creatorId = await insertUser(
      "Noop Owner",
      `phase3-noop-owner-${emailSuffix}@example.com`,
    );
    const collaboratorId = await insertUser(
      "Noop Collaborator",
      `phase3-noop-collaborator-${emailSuffix}@example.com`,
    );
    const listId = await insertList("Noop migration list", creatorId);

    await resetDatabaseToLegacyInvitationSchema();
    await client.sql`
      insert into list_collaborators ("listId", "userId", role)
      values (${listId}, ${collaboratorId}, 'collaborator')
    `;
    await client.sql`
      delete from list_collaborators
      where "userId" is null
    `;
    await dropLegacyInvitationColumns();
    await applyInvitationMigration();

    const invitationCount = await client.sql<{ count: number }>`
      select count(*)::int as count
      from invitations
    `;
    const collaborators = await client.sql<{ userId: number }>`
      select "userId"
      from list_collaborators
      where "listId" = ${listId}
      order by "userId"
    `;

    expect(invitationCount.rows).toEqual([{ count: 0 }]);
    expect(collaborators.rows).toEqual([{ userId: collaboratorId }]);
  });
});
