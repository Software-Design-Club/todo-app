import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { InvitationStatusEnum } from "@/drizzle/schema";

const repoRoot = process.cwd();

describe("invitation schema migration", () => {
  it("defines the invitation status lifecycle enum", () => {
    expect(InvitationStatusEnum.enumValues).toEqual([
      "sent",
      "accepted",
      "pending_owner_approval",
      "revoked",
      "expired",
    ]);
  });

  it("ships migration SQL with lifecycle columns and partial unique indexes", () => {
    const migrationPath = path.join(
      repoRoot,
      "drizzle",
      "0005_invitation_lifecycle.sql"
    );
    const migrationSql = readFileSync(migrationPath, "utf8");

    expect(migrationSql).toContain(
      'ALTER TABLE "list_collaborators" ALTER COLUMN "userId" DROP NOT NULL;'
    );
    expect(migrationSql).toContain(
      'ADD COLUMN "inviteStatus" "invitation_status" DEFAULT \'accepted\' NOT NULL;'
    );
    expect(migrationSql).toContain(
      '"list_collaborators_accepted_membership_unique"'
    );
    expect(migrationSql).toContain(
      '"list_collaborators_open_invite_email_unique"'
    );
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
    expect(collaboratorsAction).toContain(
      "InvitationStatusEnum.enumValues[1]"
    );
    expect(listAction).toContain("ListCollaboratorsTable.inviteStatus");
    expect(listAction).toContain("InvitationStatusEnum.enumValues[1]");
  });
});
