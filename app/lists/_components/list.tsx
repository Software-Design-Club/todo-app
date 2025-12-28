import { getList, updateListVisibility } from "@/app/lists/_actions/list";
import TodoList from "@/app/lists/_components/todo-list";
import ManageCollaborators from "@/app/lists/_components/manage-collaborators";
import CollaboratorAvatars from "@/app/lists/_components/collaborator-avatars";
import EditableListTitle from "@/app/lists/_components/editable-list-title";
import { VisibilityToggle } from "@/app/lists/_components/visibility-toggle";
import { ShareLinkButton } from "@/app/lists/_components/share-link-button";
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
import {
  isAuthorizedToEditCollaborators,
  isAuthorizedToEditList,
  isAuthorizedToChangeVisibility,
} from "@/app/lists/_actions/permissions";
import type { UserRole } from "@/components/ui/role-badge";
import { Lock, Globe } from "lucide-react";

interface ListProps {
  listId: number;
}

const List: React.FC<ListProps> = async ({ listId }) => {
  const list = await getList(listId);

  const todos = await getTodos(list.id);
  const collaborators = await getCollaborators(list.id);

  const session = await auth();
  let editableList = false;
  let editableCollaborators = false;
  let canChangeVisibility = false;
  let userRole: UserRole = "collaborator";

  const user = session?.user;
  if (user) {
    editableList = isAuthorizedToEditList(collaborators, user.id);
    editableCollaborators = isAuthorizedToEditCollaborators(
      collaborators,
      user.id
    );
    canChangeVisibility = isAuthorizedToChangeVisibility(
      collaborators,
      user.id
    );

    // Determine user's role from collaborators array
    const currentUserCollaborator = collaborators.find(
      (collab) => collab.User.id === user.id
    );

    if (currentUserCollaborator) {
      userRole = currentUserCollaborator.Role;
    }
  }

  const VisibilityIcon =
    list.visibility === "public" ? (
      <Globe className="h-5 w-5 text-muted-foreground" />
    ) : (
      <Lock className="h-5 w-5 text-muted-foreground" />
    );

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          {VisibilityIcon}
          {editableList && user ? (
            <EditableListTitle
              list={list}
              editable={editableList}
              userId={user.id}
              userRole={userRole}
            />
          ) : (
            <h2 className="text-2xl font-bold">{list.title}</h2>
          )}
        </div>
        <div className="flex items-center space-x-4">
          <CollaboratorAvatars collaborators={collaborators} />
          {list.visibility === "public" && (
            <ShareLinkButton listId={list.id} />
          )}
          {canChangeVisibility && user && (
            <VisibilityToggle
              listId={list.id}
              userId={user.id}
              initialVisibility={list.visibility}
              onToggle={updateListVisibility}
            />
          )}
          {editableCollaborators && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Manage Collaborators</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-96" align="end">
                <DropdownMenuLabel>Manage Collaborators</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <ManageCollaborators
                  listId={list.id}
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
      <TodoList todos={todos} editable={editableList} listId={list.id} />
    </div>
  );
};

export default List;
