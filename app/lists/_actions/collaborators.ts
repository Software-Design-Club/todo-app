"use server";
import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { eq, or, ilike, and } from "drizzle-orm";
import { ListCollaboratorsTable, UsersTable } from "@/drizzle/schema";
import { revalidatePath } from "next/cache";

// Initialize Drizzle client
const db = drizzle(sql);

export interface User {
  id: string; // Or number, depending on your DB and how you expose it via API
  name: string;
  email: string;
}

export async function searchUsers(searchTerm: string): Promise<User[]> {
  console.log("[Server Action] Searching users for:", searchTerm);
  if (!searchTerm.trim()) {
    return [];
  }

  const lowerSearchTerm = `%${searchTerm.toLowerCase()}%`; // Prepare for ilike

  try {
    const usersFromDb = await db
      .select({
        id: UsersTable.id,
        name: UsersTable.name,
        email: UsersTable.email,
      })
      .from(UsersTable)
      .where(
        or(
          ilike(UsersTable.name, lowerSearchTerm),
          ilike(UsersTable.email, lowerSearchTerm)
        )
      )
      .limit(10); // Add a limit to prevent overly large result sets

    // Map id to string to match the User interface
    const results: User[] = usersFromDb.map((user) => ({
      ...user,
      id: String(user.id),
    }));

    return results;
  } catch (error) {
    console.error("Database error while searching users:", error);
    // Optionally, throw a more specific error or return an empty array
    // throw new Error("Failed to search users due to a database error.");
    return []; // Return empty array on error to prevent breaking the client
  }
}

export async function addCollaborator(
  userIdString: string,
  listIdString: string
): Promise<void> {
  console.log(
    `[Server Action] Attempting to add user ${userIdString} to list ${listIdString}.`
  );

  const userId = parseInt(userIdString, 10);
  const listId = parseInt(listIdString, 10);

  if (isNaN(userId) || isNaN(listId)) {
    console.error("Invalid userId or listId provided.");
    throw new Error("Invalid user or list ID.");
  }

  try {
    // Check if the user is already a collaborator
    const existingCollaborator = await db
      .select()
      .from(ListCollaboratorsTable)
      .where(
        and(
          eq(ListCollaboratorsTable.userId, userId),
          eq(ListCollaboratorsTable.listId, listId)
        )
      )
      .limit(1);

    if (existingCollaborator.length > 0) {
      console.log(
        `User ${userId} is already a collaborator on list ${listId}.`
      );
      // Optionally, throw an error to be caught by useMutation's onError
      throw new Error("User is already a collaborator on this list.");
      // Or just return if no specific client-side error message is needed for this case
      // return;
    }

    // Add the new collaborator
    await db.insert(ListCollaboratorsTable).values({
      userId: userId,
      listId: listId,
      // createdAt and updatedAt will use defaultNow() from the schema
    });

    console.log(
      `[Server Action] User ${userId} successfully added as a collaborator to list ${listId}.`
    );

    // Revalidate the path for the list page to reflect the new collaborator
    revalidatePath(`/lists/${listId}`);
    // If you have a page showing all lists a user collaborates on, revalidate that too
    // revalidatePath(\`/user/lists\`); // Example
  } catch (error) {
    console.error("Database error while adding collaborator:", error);
    // If it's the specific error we threw, re-throw it for the client
    if (
      error instanceof Error &&
      error.message === "User is already a collaborator on this list."
    ) {
      throw error;
    }
    // For other DB errors
    throw new Error("Failed to add collaborator due to a database error.");
  }
}
