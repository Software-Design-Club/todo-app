import { getList } from "@/app/lists/_actions/list";
import TodoList from "@/app/lists/_components/todo-list";
import ManageCollaborators from "@/app/lists/_components/manage-collaborators";
import CollaboratorAvatars from "@/app/lists/_components/collaborator-avatars";
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
  getCollaborators,
  removeCollaborator,
} from "@/app/lists/_actions/collaborators";

interface ListProps {
  listId: number;
}

const List: React.FC<ListProps> = async ({ listId }) => {
  const list = await getList(listId);
  const todos = await getTodos(listId);
  const collaborators = await getCollaborators(listId);

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
        <div className="flex items-center space-x-4">
          <CollaboratorAvatars collaborators={collaborators} />
          {editable && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Manage Collaborators</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-96" align="end">
                <DropdownMenuLabel>Manage Collaborators</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <ManageCollaborators
                  listId={listIdString}
                  initialCollaborators={collaborators}
                  searchUsers={searchUsers}
                  addCollaborator={addCollaborator}
                  removeCollaborator={removeCollaborator}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <TodoList todos={todos} editable={editable} listId={listId} />
    </div>
  );
};

export default List;
