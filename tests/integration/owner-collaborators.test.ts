import type { User } from "@/lib/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getIntegrationSqlClient } from "../setup/integration";

async function importListActions() {
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
  vi.doMock("next/navigation", () => ({
    notFound: vi.fn(() => {
      throw new Error("notFound");
    }),
  }));

  return import("../../app/lists/_actions/list");
}

async function importOwnerCollaborators() {
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

  return import("../../lib/lists/owner-collaborators");
}

async function importBackfillScript() {
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

  return import("../../drizzle/backfillListCollaborators");
}

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

  return import("../../app/lists/_actions/collaborators");
}

afterEach(() => {
  vi.doUnmock("@vercel/postgres");
  vi.doUnmock("next/cache");
  vi.doUnmock("next/navigation");
  vi.resetModules();
});

describe("createList owner collaborator invariant", () => {
  it("creates an owner collaborator row before reporting success", async () => {
    const client = getIntegrationSqlClient();
    const email = `phase1-owner-${Date.now()}@example.com`;
    const insertedUsers = await client.sql<{ id: number }>`
      insert into todo_users (name, email, status)
      values ('Phase 1 Owner', ${email}, 'active')
      returning id
    `;
    const creatorId = insertedUsers.rows[0]!.id as User["id"];

    const { createList } = await importListActions();
    const formData = new FormData();
    formData.set("title", "Owner invariant list");
    formData.set("creatorId", creatorId.toString());

    const createdList = await createList(formData);

    const ownerRows = await client.sql`
      select "userId"
      from list_collaborators
      where "listId" = ${createdList.id} and "userId" = ${creatorId} and role = 'owner'
    `;

    expect(ownerRows.rows).toHaveLength(1);
  });

  it("exposes the owner row through the collaborator read path after createList", async () => {
    const client = getIntegrationSqlClient();
    const email = `phase1-read-path-${Date.now()}@example.com`;
    const insertedUsers = await client.sql<{ id: number }>`
      insert into todo_users (name, email, status)
      values ('Read Path Owner', ${email}, 'active')
      returning id
    `;
    const creatorId = insertedUsers.rows[0]!.id as User["id"];

    const { createList } = await importListActions();
    const { getCollaborators } = await importCollaboratorsActions();
    const formData = new FormData();
    formData.set("title", "Read path list");
    formData.set("creatorId", creatorId.toString());

    const createdList = await createList(formData);
    const collaborators = await getCollaborators(createdList.id);

    expect(collaborators).toEqual([
      expect.objectContaining({
        listId: createdList.id,
        Role: "owner",
        User: expect.objectContaining({
          id: creatorId,
          email,
        }),
      }),
    ]);
  });

  it('returns "inserted" when the owner row is missing', async () => {
    const client = getIntegrationSqlClient();
    const email = `phase1-upsert-inserted-${Date.now()}@example.com`;
    const insertedUsers = await client.sql<{ id: number }>`
      insert into todo_users (name, email, status)
      values ('Inserted Outcome Owner', ${email}, 'active')
      returning id
    `;
    const creatorId = insertedUsers.rows[0]!.id as User["id"];
    const insertedLists = await client.sql<{ id: number }>`
      insert into lists (title, "creatorId", visibility, state)
      values ('Inserted outcome list', ${creatorId}, 'private', 'active')
      returning id
    `;
    const listId = insertedLists.rows[0]!.id as number;

    const { upsertOwnerCollaborator } = await importOwnerCollaborators();
    const result = await upsertOwnerCollaborator({
      listId: listId as never,
      ownerId: creatorId,
    });

    const ownerRows = await client.sql`
      select "userId", role
      from list_collaborators
      where "listId" = ${listId} and "userId" = ${creatorId}
    `;

    expect(result).toBe("inserted");
    expect(ownerRows.rows).toHaveLength(1);
    expect(ownerRows.rows[0]?.role).toBe("owner");
  });

  it('returns "repaired" when the existing owner row has the wrong role', async () => {
    const client = getIntegrationSqlClient();
    const email = `phase1-upsert-repaired-${Date.now()}@example.com`;
    const insertedUsers = await client.sql<{ id: number }>`
      insert into todo_users (name, email, status)
      values ('Repaired Outcome Owner', ${email}, 'active')
      returning id
    `;
    const creatorId = insertedUsers.rows[0]!.id as User["id"];
    const insertedLists = await client.sql<{ id: number }>`
      insert into lists (title, "creatorId", visibility, state)
      values ('Repaired outcome list', ${creatorId}, 'private', 'active')
      returning id
    `;
    const listId = insertedLists.rows[0]!.id as number;

    await client.sql`
      insert into list_collaborators ("listId", "userId", role)
      values (${listId}, ${creatorId}, 'collaborator')
    `;

    const { upsertOwnerCollaborator } = await importOwnerCollaborators();
    const result = await upsertOwnerCollaborator({
      listId: listId as never,
      ownerId: creatorId,
    });

    const ownerRows = await client.sql`
      select role
      from list_collaborators
      where "listId" = ${listId} and "userId" = ${creatorId}
    `;

    expect(result).toBe("repaired");
    expect(ownerRows.rows).toEqual([{ role: "owner" }]);
  });

  it('returns "unchanged" when the owner row already exists correctly', async () => {
    const client = getIntegrationSqlClient();
    const email = `phase1-upsert-unchanged-${Date.now()}@example.com`;
    const insertedUsers = await client.sql<{ id: number }>`
      insert into todo_users (name, email, status)
      values ('Unchanged Outcome Owner', ${email}, 'active')
      returning id
    `;
    const creatorId = insertedUsers.rows[0]!.id as User["id"];
    const insertedLists = await client.sql<{ id: number }>`
      insert into lists (title, "creatorId", visibility, state)
      values ('Unchanged outcome list', ${creatorId}, 'private', 'active')
      returning id
    `;
    const listId = insertedLists.rows[0]!.id as number;

    await client.sql`
      insert into list_collaborators ("listId", "userId", role)
      values (${listId}, ${creatorId}, 'owner')
    `;

    const { upsertOwnerCollaborator } = await importOwnerCollaborators();
    const result = await upsertOwnerCollaborator({
      listId: listId as never,
      ownerId: creatorId,
    });

    const ownerRows = await client.sql`
      select "userId"
      from list_collaborators
      where "listId" = ${listId} and "userId" = ${creatorId} and role = 'owner'
    `;

    expect(result).toBe("unchanged");
    expect(ownerRows.rows).toHaveLength(1);
  });

  it("does not create duplicate owner memberships on repeated calls", async () => {
    const client = getIntegrationSqlClient();
    const email = `phase1-no-duplicates-${Date.now()}@example.com`;
    const insertedUsers = await client.sql<{ id: number }>`
      insert into todo_users (name, email, status)
      values ('Duplicate Guard Owner', ${email}, 'active')
      returning id
    `;
    const creatorId = insertedUsers.rows[0]!.id as User["id"];
    const insertedLists = await client.sql<{ id: number }>`
      insert into lists (title, "creatorId", visibility, state)
      values ('No duplicates list', ${creatorId}, 'private', 'active')
      returning id
    `;
    const listId = insertedLists.rows[0]!.id as number;

    const { upsertOwnerCollaborator } = await importOwnerCollaborators();

    await upsertOwnerCollaborator({
      listId: listId as never,
      ownerId: creatorId,
    });
    const secondResult = await upsertOwnerCollaborator({
      listId: listId as never,
      ownerId: creatorId,
    });

    const ownerRows = await client.sql`
      select "userId"
      from list_collaborators
      where "listId" = ${listId} and "userId" = ${creatorId} and role = 'owner'
    `;

    expect(secondResult).toBe("unchanged");
    expect(ownerRows.rows).toHaveLength(1);
  });

  it("does not modify unrelated collaborator rows", async () => {
    const client = getIntegrationSqlClient();
    const emailSuffix = Date.now();
    const insertedUsers = await client.sql<{ id: number }>`
      insert into todo_users (name, email, status)
      values
        ('Invariant Owner', ${`phase1-owner-${emailSuffix}@example.com`}, 'active'),
        ('Unrelated Collaborator', ${`phase1-collab-${emailSuffix}@example.com`}, 'active')
      returning id
    `;
    const creatorId = insertedUsers.rows[0]!.id as User["id"];
    const unrelatedUserId = insertedUsers.rows[1]!.id;
    const insertedLists = await client.sql<{ id: number }>`
      insert into lists (title, "creatorId", visibility, state)
      values ('Unrelated rows list', ${creatorId}, 'private', 'active')
      returning id
    `;
    const listId = insertedLists.rows[0]!.id as number;

    await client.sql`
      insert into list_collaborators ("listId", "userId", role)
      values (${listId}, ${unrelatedUserId}, 'collaborator')
    `;

    const { upsertOwnerCollaborator } = await importOwnerCollaborators();
    await upsertOwnerCollaborator({
      listId: listId as never,
      ownerId: creatorId,
    });

    const unrelatedRows = await client.sql`
      select "userId", role
      from list_collaborators
      where "listId" = ${listId} and "userId" = ${unrelatedUserId}
    `;

    expect(unrelatedRows.rows).toEqual([
      {
        userId: unrelatedUserId,
        role: "collaborator",
      },
    ]);
  });

  it("throws ListNotFoundError for an unknown list", async () => {
    const client = getIntegrationSqlClient();
    const email = `phase1-list-not-found-${Date.now()}@example.com`;
    const insertedUsers = await client.sql<{ id: number }>`
      insert into todo_users (name, email, status)
      values ('List Missing Owner', ${email}, 'active')
      returning id
    `;
    const ownerId = insertedUsers.rows[0]!.id as User["id"];

    const { upsertOwnerCollaborator } = await importOwnerCollaborators();

    await expect(
      upsertOwnerCollaborator({
        listId: 999999999 as never,
        ownerId,
      }),
    ).rejects.toMatchObject({
      name: "ListNotFoundError",
      message: "List not found: 999999999",
    });
  });

  it("throws UserNotFoundError for an unknown user", async () => {
    const client = getIntegrationSqlClient();
    const email = `phase1-user-not-found-${Date.now()}@example.com`;
    const insertedUsers = await client.sql<{ id: number }>`
      insert into todo_users (name, email, status)
      values ('Existing Owner', ${email}, 'active')
      returning id
    `;
    const creatorId = insertedUsers.rows[0]!.id;
    const insertedLists = await client.sql<{ id: number }>`
      insert into lists (title, "creatorId", visibility, state)
      values ('Missing user list', ${creatorId}, 'private', 'active')
      returning id
    `;
    const listId = insertedLists.rows[0]!.id as number;

    const { upsertOwnerCollaborator } = await importOwnerCollaborators();

    await expect(
      upsertOwnerCollaborator({
        listId: listId as never,
        ownerId: 999999999 as never,
      }),
    ).rejects.toMatchObject({
      name: "UserNotFoundError",
      message: "User not found: 999999999",
    });
  });

  it(
    "backfills missing and incorrect owner rows with structured counts",
    async () => {
    const client = getIntegrationSqlClient();
    const { backfillOwnerCollaborators } = await importBackfillScript();
    await backfillOwnerCollaborators();
    const baselineListCountResult = await client.sql<{ count: string }>`
      select count(*)::text as count
      from lists
    `;
    const baselineListCount = Number(baselineListCountResult.rows[0]!.count);
    const emailSuffix = Date.now();
    const insertedUsers = await client.sql<{ id: number; email: string }>`
      insert into todo_users (name, email, status)
      values
        ('Missing Owner', ${`missing-owner-${emailSuffix}@example.com`}, 'active'),
        ('Wrong Role Owner', ${`wrong-role-${emailSuffix}@example.com`}, 'active'),
        ('Already Correct Owner', ${`correct-owner-${emailSuffix}@example.com`}, 'active')
      returning id, email
    `;
    const missingOwnerId = insertedUsers.rows[0]!.id;
    const wrongRoleOwnerId = insertedUsers.rows[1]!.id;
    const correctOwnerId = insertedUsers.rows[2]!.id;

    const insertedLists = await client.sql<{ id: number }>`
      insert into lists (title, "creatorId", visibility, state)
      values
        ('Missing owner list', ${missingOwnerId}, 'private', 'active'),
        ('Wrong role list', ${wrongRoleOwnerId}, 'private', 'active'),
        ('Correct owner list', ${correctOwnerId}, 'private', 'active')
      returning id
    `;
    const missingOwnerListId = insertedLists.rows[0]!.id;
    const wrongRoleListId = insertedLists.rows[1]!.id;
    const correctOwnerListId = insertedLists.rows[2]!.id;

    await client.sql`
      insert into list_collaborators ("listId", "userId", role)
      values
        (${wrongRoleListId}, ${wrongRoleOwnerId}, 'collaborator'),
        (${correctOwnerListId}, ${correctOwnerId}, 'owner')
    `;

    const report = await backfillOwnerCollaborators();

    const ownerRows = await client.sql`
      select "listId", "userId", role
      from list_collaborators
      where "listId" in (${missingOwnerListId}, ${wrongRoleListId}, ${correctOwnerListId})
      order by "listId" asc
    `;

    expect(report).toEqual({
      scanned: baselineListCount + 3,
      inserted: 1,
      repaired: 1,
      unchanged: baselineListCount + 1,
    });
    expect(ownerRows.rows).toEqual([
      {
        listId: missingOwnerListId,
        userId: missingOwnerId,
        role: "owner",
      },
      {
        listId: wrongRoleListId,
        userId: wrongRoleOwnerId,
        role: "owner",
      },
      {
        listId: correctOwnerListId,
        userId: correctOwnerId,
        role: "owner",
      },
    ]);
    },
    15_000,
  );

  it(
    "is idempotent across repeated backfill runs",
    async () => {
      const client = getIntegrationSqlClient();
      const { backfillOwnerCollaborators } = await importBackfillScript();
      const initialReport = await backfillOwnerCollaborators();
      const secondReport = await backfillOwnerCollaborators();

      const listCountResult = await client.sql<{ count: string }>`
        select count(*)::text as count
        from lists
      `;
      const listCount = Number(listCountResult.rows[0]!.count);

      expect(initialReport.scanned).toBe(listCount);
      expect(secondReport).toEqual({
        scanned: listCount,
        inserted: 0,
        repaired: 0,
        unchanged: listCount,
      });
    },
    15_000,
  );
});
