import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { InvitationStatusEnum } from "@/drizzle/schema";
import { INVITATION_STATUS } from "@/lib/invitations/constants";

const repoRoot = process.cwd();

describe("invitation schema migration", () => {
  it("defines the invitation status lifecycle enum", () => {
    expect(InvitationStatusEnum.enumValues).toEqual([
      "sent",
      "accepted",
      "pending_approval",
      "revoked",
      "expired",
    ]);
  });

  it("ships lifecycle schema and migration markers for invitations", () => {
    const schemaPath = path.join(repoRoot, "drizzle", "schema.ts");
    const schemaSource = readFileSync(schemaPath, "utf8");
    const migrationDir = path.join(repoRoot, "drizzle");
    const migrationSql = readdirSync(migrationDir)
      .filter((fileName) => fileName.endsWith(".sql"))
      .map((fileName) => readFileSync(path.join(migrationDir, fileName), "utf8"))
      .join("\n");

    expect(schemaSource).toContain('InvitationStatusEnum = pgEnum("invitation_status"');
    expect(schemaSource).toContain('userId: integer("userId")');
    expect(schemaSource).toContain('"list_collaborators_accepted_membership_unique"');
    expect(schemaSource).toContain('"list_collaborators_open_invite_email_unique"');
    expect(migrationSql).toContain('"invitation_status"');
  });

  it("keeps provider-id lookup index after 0008 migration", () => {
    const migration0007Path = path.join(
      repoRoot,
      "drizzle",
      "0007_email_delivery_provider_id_index.sql"
    );
    const migration0008Path = path.join(
      repoRoot,
      "drizzle",
      "0008_rename_owner_columns_and_pending_status.sql"
    );
    const migration0007 = readFileSync(migration0007Path, "utf8");
    const migration0008 = readFileSync(migration0008Path, "utf8");

    expect(migration0007).toContain(
      'CREATE INDEX "list_collaborators_email_delivery_provider_id_idx"'
    );
    expect(migration0008).not.toContain(
      'DROP INDEX IF EXISTS "list_collaborators_email_delivery_provider_id_idx"'
    );
  });

  it("keeps migration journal aligned with migration SQL files", () => {
    const migrationDir = path.join(repoRoot, "drizzle");
    const journalPath = path.join(repoRoot, "drizzle", "meta", "_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    const migrationTags = readdirSync(migrationDir)
      .filter((fileName) => fileName.endsWith(".sql"))
      .map((fileName) => fileName.replace(/\.sql$/, ""))
      .sort();
    const journalTags = journal.entries.map((entry) => entry.tag).sort();

    expect(journal.entries.map((entry) => entry.idx)).toEqual(
      journal.entries.map((_, index) => index)
    );
    expect(journalTags).toEqual(migrationTags);
  });

  it("keeps collaborator read paths filtered to accepted rows", () => {
    const collaboratorsActionPath = path.join(
      repoRoot,
      "app",
      "lists",
      "_actions",
      "collaborators.ts"
    );
    const listActionPath = path.join(
      repoRoot,
      "app",
      "lists",
      "_actions",
      "list.ts"
    );

    const collaboratorsAction = readFileSync(collaboratorsActionPath, "utf8");
    const listAction = readFileSync(listActionPath, "utf8");

    expect(collaboratorsAction).toContain(
      "ListCollaboratorsTable.inviteStatus"
    );
    expect(collaboratorsAction).toContain("INVITATION_STATUS.ACCEPTED");
    expect(listAction).toContain("ListCollaboratorsTable.inviteStatus");
    expect(listAction).toContain("INVITATION_STATUS.ACCEPTED");
    expect(INVITATION_STATUS.ACCEPTED).toBe("accepted");
  });
});
