import { getLists } from "@/app/lists/_actions/list";
import Link from "next/link";
import React from "react";
import CreateListForm from "./create-list";
import type { User } from "@/lib/types";
import { UserListsTable } from "./user-lists-table";

interface ListsProps {
  currentPath: string;
  userId: User["id"];
}

const UserLists: React.FC<ListsProps> = async ({ currentPath, userId }) => {
  // Fetch active and archived lists in parallel
  const [lists, archivedLists] = await Promise.all([
    getLists(userId, false),
    getLists(userId, true),
  ]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2>
          {currentPath === "/lists" ? (
            "Your Lists"
          ) : (
            <Link href="/lists">Your Lists</Link>
          )}
        </h2>
        <div className="flex items-center gap-2">
          <Link
            href="/lists/collaborators"
            className="text-sm text-blue-600 hover:underline"
          >
            Manage Invitations
          </Link>
          <CreateListForm creatorId={userId} />
        </div>
      </div>

      <UserListsTable lists={lists} archivedLists={archivedLists} userId={userId} />
    </div>
  );
};

export default UserLists;
