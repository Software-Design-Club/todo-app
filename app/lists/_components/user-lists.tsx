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
  const lists = await getLists(userId);

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
        <CreateListForm creatorId={userId} />
      </div>

      <UserListsTable lists={lists} />
    </div>
  );
};

export default UserLists;
