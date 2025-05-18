import { getList } from "@/app/lists/_actions/list";
import TodoList from "@/app/lists/_components/todo-list";
import InviteCollaborators from "@/app/lists/_components/invite-collaborators";
import { auth } from "@/auth";
import React from "react";
import { getTodos } from "../_actions/todo";
import { Button } from "@/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/ui/dropdown-menu";
import {
  searchUsers,
  addCollaborator,
} from "@/app/lists/_actions/collaborators";

interface ListProps {
  listId: number;
}

const List: React.FC<ListProps> = async ({ listId }) => {
  const list = await getList(listId);
  const todos = await getTodos(listId);

  const session = await auth();
  let editable = false;
  const user = session?.user;
  if (user?.email) {
    editable = true;
  }

  const listIdString = String(listId);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">{list.title}</h2>
        {editable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">Add Collaborator</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-80" align="end">
              <DropdownMenuLabel>Invite to List</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <InviteCollaborators
                listId={listIdString}
                searchUsers={searchUsers}
                addCollaborator={addCollaborator}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <TodoList todos={todos} editable={editable} listId={listId} />
    </div>
  );
};

export default List;
