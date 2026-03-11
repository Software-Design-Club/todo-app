import "@/drizzle/envConfig";

import { sql } from "@vercel/postgres";
import { expect, test } from "@playwright/test";

import { authenticateAs } from "../support/auth";
import {
  clearInvitationMailbox,
  readInvitationMailbox,
} from "../support/invitation-mailbox";

type FixtureTracker = {
  invitationIds: number[];
  listIds: number[];
  userIds: number[];
};

function createFixtureTracker(): FixtureTracker {
  return {
    invitationIds: [],
    listIds: [],
    userIds: [],
  };
}

async function cleanupFixture(fixture: FixtureTracker) {
  for (const invitationId of fixture.invitationIds) {
    await sql`delete from invitations where id = ${invitationId}`;
  }

  for (const listId of fixture.listIds) {
    await sql`delete from list_collaborators where "listId" = ${listId}`;
    await sql`delete from lists where id = ${listId}`;
  }

  for (const userId of fixture.userIds) {
    await sql`delete from todo_users where id = ${userId}`;
  }
}

async function insertUser(
  fixture: FixtureTracker,
  name: string,
  email: string,
) {
  const result = await sql<{ id: number }>`
    insert into todo_users (name, email, status)
    values (${name}, ${email}, 'active')
    returning id
  `;

  const id = result.rows[0]!.id;
  fixture.userIds.push(id);

  return id;
}

async function insertList(
  fixture: FixtureTracker,
  title: string,
  creatorId: number,
) {
  const result = await sql<{ id: number }>`
    insert into lists (title, "creatorId", visibility, state)
    values (${title}, ${creatorId}, 'private', 'active')
    returning id
  `;

  const id = result.rows[0]!.id;
  fixture.listIds.push(id);

  return id;
}

async function addCollaboratorRow(input: {
  listId: number;
  userId: number;
  role: "owner" | "collaborator";
}) {
  await sql`
    insert into list_collaborators ("listId", "userId", role)
    values (${input.listId}, ${input.userId}, ${input.role})
  `;
}

async function insertInvitation(
  fixture: FixtureTracker,
  input: {
    listId: number;
    inviterId: number;
    invitedEmail: string;
    status: "sent" | "pending_approval";
    acceptedByUserId?: number;
    acceptedByEmail?: string | null;
  },
) {
  const result = await sql<{ id: number }>`
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
      ${input.listId},
      ${input.inviterId},
      ${input.invitedEmail.toLowerCase()},
      'collaborator',
      ${input.status},
      ${`e2e-secret-${Date.now()}-${Math.random()}`},
      now() + interval '7 days',
      ${input.acceptedByUserId ?? null},
      ${input.acceptedByEmail ?? null}
    )
    returning id
  `;

  const id = result.rows[0]!.id;
  fixture.invitationIds.push(id);

  return id;
}

async function findInvitationByEmail(listId: number, invitedEmail: string) {
  const result = await sql<{
    id: number;
    status: string;
  }>`
    select id, status
    from invitations
    where "listId" = ${listId}
      and "invitedEmailNormalized" = ${invitedEmail.toLowerCase()}
    order by id desc
    limit 1
  `;

  return result.rows[0] ?? null;
}

async function hasCollaboratorRow(listId: number, userId: number) {
  const result = await sql<{ count: string }>`
    select count(*)::text as count
    from list_collaborators
    where "listId" = ${listId} and "userId" = ${userId}
  `;

  return Number(result.rows[0]?.count ?? "0") > 0;
}

test.beforeEach(async () => {
  await clearInvitationMailbox();
});

test("redirects unauthenticated users to sign-in @smoke", async ({ page }) => {
  await page.goto("/lists/collaborators");

  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
});

test("shows authorized collaborator-management data and supports copy-link plus resend @smoke", async ({
  page,
}) => {
  const fixture = createFixtureTracker();
  const emailSuffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  try {
    const ownerEmail = `phase8-e2e-owner-${emailSuffix}@example.com`;
    const collaboratorEmail = `phase8-e2e-collab-${emailSuffix}@example.com`;
    const invitedEmail = `phase8-e2e-invite-${emailSuffix}@example.com`;
    const pendingEmail = `phase8-e2e-pending-${emailSuffix}@example.com`;

    const ownerId = await insertUser(fixture, "E2E Owner", ownerEmail);
    const collaboratorId = await insertUser(
      fixture,
      "E2E Collaborator",
      collaboratorEmail,
    );
    const pendingUserId = await insertUser(
      fixture,
      "Pending User",
      pendingEmail,
    );
    const listTitle = `Phase 8 management ${emailSuffix}`;
    const listId = await insertList(fixture, listTitle, ownerId);

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });
    await addCollaboratorRow({
      listId,
      userId: collaboratorId,
      role: "collaborator",
    });
    await insertInvitation(fixture, {
      listId,
      inviterId: ownerId,
      invitedEmail,
      status: "sent",
    });
    await insertInvitation(fixture, {
      listId,
      inviterId: ownerId,
      invitedEmail: `phase8-e2e-awaiting-${emailSuffix}@example.com`,
      status: "pending_approval",
      acceptedByUserId: pendingUserId,
      acceptedByEmail: pendingEmail,
    });

    await authenticateAs(page.context(), ownerEmail);
    await page.context().grantPermissions([
      "clipboard-read",
      "clipboard-write",
    ]);

    await page.goto("/lists/collaborators");

    await expect(
      page.getByRole("heading", { name: "Collaborator Management" }),
    ).toBeVisible();
    await expect(page.getByText(listTitle)).toBeVisible();
    await expect(page.getByText(collaboratorEmail)).toBeVisible();
    await expect(page.getByText(invitedEmail)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Pending Approval" }),
    ).toBeVisible();

    const invitationRow = page.locator("li", { hasText: invitedEmail });
    await invitationRow.getByRole("button", { name: "Copy Link" }).click();

    await expect(
      invitationRow.getByRole("button", { name: "Copied" }),
    ).toBeVisible();

    const copiedInvitationUrl = await page.evaluate(() => {
      return navigator.clipboard.readText();
    });

    expect(copiedInvitationUrl).toMatch(
      /^http:\/\/localhost:3001\/invite\?token=/,
    );
    await expect.poll(async () => (await readInvitationMailbox()).length).toBe(0);

    await invitationRow.getByRole("button", { name: "Resend" }).click();

    await expect(page.getByText("Invitation resent.")).toBeVisible();
    await expect.poll(async () => (await readInvitationMailbox()).length).toBe(1);

    const [delivery] = await readInvitationMailbox();
    expect(delivery?.acceptanceUrl).toMatch(
      /^http:\/\/localhost:3001\/invite\?token=/,
    );
    expect(delivery?.acceptanceUrl).not.toBe(copiedInvitationUrl);
  } finally {
    await cleanupFixture(fixture);
  }
});

test("does not show unauthorized list data to authenticated non-owners @smoke", async ({
  page,
}) => {
  const fixture = createFixtureTracker();
  const emailSuffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  try {
    const ownerEmail = `phase8-e2e-route-owner-${emailSuffix}@example.com`;
    const collaboratorEmail =
      `phase8-e2e-route-collab-${emailSuffix}@example.com`;
    const ownerId = await insertUser(fixture, "Route Owner", ownerEmail);
    const collaboratorId = await insertUser(
      fixture,
      "Route Collaborator",
      collaboratorEmail,
    );
    const listTitle = `Hidden management list ${emailSuffix}`;
    const listId = await insertList(fixture, listTitle, ownerId);

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });
    await addCollaboratorRow({
      listId,
      userId: collaboratorId,
      role: "collaborator",
    });

    await authenticateAs(page.context(), collaboratorEmail);
    await page.goto("/lists/collaborators");

    await expect(
      page.getByText(
        "You do not own any lists. Create a list to manage collaborators.",
      ),
    ).toBeVisible();
    await expect(page.getByText(listTitle)).not.toBeVisible();
  } finally {
    await cleanupFixture(fixture);
  }
});

test("owners can send and revoke invites from the management page", async ({
  page,
}) => {
  const fixture = createFixtureTracker();
  const emailSuffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  try {
    const ownerEmail = `phase8-e2e-send-owner-${emailSuffix}@example.com`;
    const inviteeEmail = `phase8-e2e-send-invitee-${emailSuffix}@example.com`;
    const ownerId = await insertUser(fixture, "Send Owner", ownerEmail);
    const listTitle = `Send management list ${emailSuffix}`;
    const listId = await insertList(fixture, listTitle, ownerId);

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });

    await authenticateAs(page.context(), ownerEmail);
    await page.goto("/lists/collaborators");

    await page.getByPlaceholder("Invite by email").fill(inviteeEmail);
    await page.getByRole("button", { name: "Send Invite" }).click();

    await expect.poll(async () => (await readInvitationMailbox()).length).toBe(1);
    await expect
      .poll(async () => findInvitationByEmail(listId, inviteeEmail))
      .toMatchObject({ status: "sent" });

    await page.reload();

    const invitationRow = page.locator("li", { hasText: inviteeEmail });
    await invitationRow.getByRole("button", { name: "Revoke" }).click();

    await expect
      .poll(async () => findInvitationByEmail(listId, inviteeEmail))
      .toMatchObject({ status: "revoked" });
  } finally {
    await cleanupFixture(fixture);
  }
});

test("owners can approve and reject pending-approval invites from the management page", async ({
  page,
}) => {
  const fixture = createFixtureTracker();
  const emailSuffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  try {
    const ownerEmail = `phase8-e2e-approve-owner-${emailSuffix}@example.com`;
    const approveUserEmail = `phase8-e2e-approve-user-${emailSuffix}@example.com`;
    const rejectUserEmail = `phase8-e2e-reject-user-${emailSuffix}@example.com`;
    const ownerId = await insertUser(fixture, "Approve Owner", ownerEmail);
    const approveUserId = await insertUser(
      fixture,
      "Approve User",
      approveUserEmail,
    );
    const rejectUserId = await insertUser(
      fixture,
      "Reject User",
      rejectUserEmail,
    );
    const listId = await insertList(
      fixture,
      `Approval management list ${emailSuffix}`,
      ownerId,
    );

    await addCollaboratorRow({ listId, userId: ownerId, role: "owner" });

    const approveInvitationId = await insertInvitation(fixture, {
      listId,
      inviterId: ownerId,
      invitedEmail: `phase8-e2e-approve-target-${emailSuffix}@example.com`,
      status: "pending_approval",
      acceptedByUserId: approveUserId,
      acceptedByEmail: approveUserEmail,
    });
    const rejectInvitationId = await insertInvitation(fixture, {
      listId,
      inviterId: ownerId,
      invitedEmail: `phase8-e2e-reject-target-${emailSuffix}@example.com`,
      status: "pending_approval",
      acceptedByUserId: rejectUserId,
      acceptedByEmail: rejectUserEmail,
    });

    await authenticateAs(page.context(), ownerEmail);
    await page.goto("/lists/collaborators");

    const approveRow = page.locator("li", {
      hasText: `phase8-e2e-approve-target-${emailSuffix}@example.com`,
    });
    await approveRow.getByRole("button", { name: "Approve" }).click();

    await expect
      .poll(async () => {
        const invitation = await sql<{ status: string }>`
          select status
          from invitations
          where id = ${approveInvitationId}
        `;

        return invitation.rows[0]?.status ?? null;
      })
      .toBe("accepted");
    await expect
      .poll(async () => hasCollaboratorRow(listId, approveUserId))
      .toBe(true);

    const rejectRow = page.locator("li", {
      hasText: `phase8-e2e-reject-target-${emailSuffix}@example.com`,
    });
    await rejectRow.getByRole("button", { name: "Reject" }).click();

    await expect
      .poll(async () => {
        const invitation = await sql<{ status: string }>`
          select status
          from invitations
          where id = ${rejectInvitationId}
        `;

        return invitation.rows[0]?.status ?? null;
      })
      .toBe("revoked");
    await expect
      .poll(async () => hasCollaboratorRow(listId, rejectUserId))
      .toBe(false);
  } finally {
    await cleanupFixture(fixture);
  }
});
