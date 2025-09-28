"use client";

import React, { memo } from "react";
import { Button } from "@/ui/button";
import { Avatar, AvatarFallback } from "@/ui/avatar";
import { XIcon } from "lucide-react";
import type { User, ListUser } from "@/lib/types";

interface CollaboratorListItemProps {
  collaborator: ListUser;
  onRemove: (userId: User["id"]) => void;
  pendingRemoval: boolean;
  isRemoving: boolean;
  getInitials: (name: User["name"]) => string;
}

export const CollaboratorListItem = memo(
  ({
    collaborator,
    onRemove,
    pendingRemoval,
    isRemoving,
    getInitials,
  }: CollaboratorListItemProps) => {
    const { User: user, Role: role } = collaborator;

    return (
      <li className="flex items-center justify-between p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600">
        <CollaboratorInfo user={user} role={role} getInitials={getInitials} />
        <RemoveButton
          user={user}
          onRemove={onRemove}
          pendingRemoval={pendingRemoval}
          isRemoving={isRemoving}
        />
      </li>
    );
  }
);

CollaboratorListItem.displayName = "CollaboratorListItem";

// Sub-components for better organization
const CollaboratorInfo = memo(
  ({
    user,
    role,
    getInitials,
  }: {
    user: User;
    role: ListUser["Role"];
    getInitials: (name: User["name"]) => string;
  }) => (
    <div className="flex items-center space-x-2">
      <Avatar className="w-7 h-7">
        <AvatarFallback className="text-xs">
          {getInitials(user.name)}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col">
        <div>
          <p className="text-sm font-medium">{user.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {user.email}
          </p>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">{role}</p>
      </div>
    </div>
  )
);

CollaboratorInfo.displayName = "CollaboratorInfo";

const RemoveButton = memo(
  ({
    user,
    onRemove,
    pendingRemoval,
    isRemoving,
  }: {
    user: User;
    onRemove: (userId: User["id"]) => void;
    pendingRemoval: boolean;
    isRemoving: boolean;
  }) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onRemove(user.id)}
      disabled={pendingRemoval}
      className="text-red-500 hover:text-red-700"
      aria-label={`Remove ${user.name}`}
    >
      {isRemoving ? "..." : <XIcon className="w-4 h-4" />}
    </Button>
  )
);

RemoveButton.displayName = "RemoveButton";
