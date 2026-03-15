"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/ui/button";
import { useMutation } from "@tanstack/react-query";
import type { EmailAddress, InvitationSummary, List, ListUser, SentInvitationSummary, User } from "@/lib/types";
import { CollaboratorListItem } from "./collaborator-list-item";
import { PendingInvitationsList } from "./pending-invitations-list";
import { InviteByEmailForm } from "./invite-by-email-form";
import {
  searchInvitableUsers,
  removeCollaborator,
} from "@/app/lists/_actions/collaborators";
import { inviteCollaborator } from "@/app/lists/_actions/invitations";

interface ManageCollaboratorsProps {
  listId: List["id"];
  initialCollaborators: ListUser[];
  initialInvitations: InvitationSummary[];
}

export default function ManageCollaborators({
  listId,
  initialCollaborators,
  initialInvitations,
}: ManageCollaboratorsProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedUserToAdd, setSelectedUserToAdd] = useState<User | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currentCollaborators, setCurrentCollaborators] =
    useState<ListUser[]>(initialCollaborators);
  const [invitations, setInvitations] = useState<InvitationSummary[]>(initialInvitations);

  useEffect(() => {
    setCurrentCollaborators(initialCollaborators);
  }, [initialCollaborators]);

  const clearMessages = () => {
    setError(null);
    setSuccessMessage(null);
  };

  const getInitials = useCallback((name: User["name"]): string => {
    return (
      name
        ?.split(" ")
        .map((word) => word.charAt(0))
        .join("")
        .toUpperCase()
        .slice(0, 2) || ""
    );
  }, []);

  const inviteCollaboratorMutation = useMutation({
    mutationFn: (user: User) =>
      inviteCollaborator({
        listId,
        invitedEmail: user.email as unknown as EmailAddress,
      }),
    onSuccess: (result, user: User) => {
      if (result.kind === "success") {
        setInvitations((prev) => [...prev, result.invitation as SentInvitationSummary]);
        setSuccessMessage(`Invitation sent to ${user.name}.`);
        setSelectedUserToAdd(null);
        setSearchTerm("");
        setSearchResults([]);
        setError(null);
      } else {
        setError(result.errorMessage);
        setSuccessMessage(null);
      }
    },
    onError: (err: Error) => {
      setError(err.message || "Failed to send invitation.");
      setSuccessMessage(null);
    },
  });

  const removeCollaboratorMutation = useMutation({
    mutationFn: (listUser: ListUser) => removeCollaborator(listUser),
    onSuccess: (_, listUser: ListUser) => {
      const removedUser = currentCollaborators.find(
        (c) => c.User.id === listUser.User.id
      );
      setSuccessMessage(
        `${removedUser?.User.name || "User"} removed successfully.`
      );
      setCurrentCollaborators((prev) =>
        prev.filter((user) => user.User.id !== listUser.User.id)
      );
      setError(null);
    },
    onError: (err: Error, listUser: ListUser) => {
      const user = currentCollaborators.find(
        (c) => c.User.id === listUser.User.id
      );
      setError(
        `Failed to remove ${user?.User.name || "user"}. ${
          err.message || "Please try again."
        }`
      );
      setSuccessMessage(null);
    },
  });

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      setSelectedUserToAdd(null);
      clearMessages();
      return;
    }
    setSearchLoading(true);
    clearMessages();
    setSelectedUserToAdd(null);
    setSearchResults([]);

    try {
      const users = await searchInvitableUsers(searchTerm, listId);
      setSearchResults(users);
      if (users.length === 0) {
        setError("No users found.");
      }
    } catch (err: unknown) {
      console.error("Error searching users:", err);
      let errorMessage = "Search failed. Try again.";
      if (err instanceof Error) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleInviteCollaborator = () => {
    if (selectedUserToAdd) {
      clearMessages();
      inviteCollaboratorMutation.mutate(selectedUserToAdd);
    }
  };

  const handleRemoveCollaborator = (listUser: ListUser) => {
    clearMessages();
    removeCollaboratorMutation.mutate(listUser);
  };

  useEffect(() => {
    clearMessages();
  }, [listId]);

  return (
    <div className="p-2 space-y-4">
      {successMessage && (
        <div className="mb-2 p-2 bg-green-100 border border-green-300 text-green-700 rounded-md text-sm">
          {successMessage}
        </div>
      )}
      {error && (
        <div className="mb-2 p-2 bg-red-100 border border-red-300 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      <div>
        <h3 className="text-md font-semibold mb-2">Current Collaborators</h3>
        {currentCollaborators.length > 0 ? (
          <ul className="space-y-2 max-h-48 overflow-y-auto">
            {currentCollaborators.map((collaborator) => (
              <CollaboratorListItem
                key={collaborator.User.id}
                collaborator={collaborator}
                onRemove={handleRemoveCollaborator}
                pendingRemoval={removeCollaboratorMutation.isPending}
                isRemoving={
                  removeCollaboratorMutation.isPending &&
                  removeCollaboratorMutation.variables === collaborator
                }
                getInitials={getInitials}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No collaborators yet.
          </p>
        )}
      </div>

      <PendingInvitationsList invitations={invitations} />

      <div>
        <h3 className="text-md font-semibold mb-2">Invite New Collaborators</h3>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              clearMessages();
              if (e.target.value.trim() === "") {
                setError(null);
                setSearchResults([]);
                setSelectedUserToAdd(null);
              }
            }}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !inviteCollaboratorMutation.isPending &&
                !searchLoading
              ) {
                handleSearch();
              }
            }}
            placeholder="Search by name or email"
            className="border border-gray-300 p-2 rounded-md text-sm flex-grow focus:ring-2 focus:ring-blue-500 outline-none dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            disabled={
              inviteCollaboratorMutation.isPending ||
              searchLoading ||
              removeCollaboratorMutation.isPending
            }
          />
          <Button
            onClick={handleSearch}
            disabled={
              searchLoading ||
              !searchTerm.trim() ||
              inviteCollaboratorMutation.isPending ||
              removeCollaboratorMutation.isPending
            }
            variant="outline"
            size="sm"
          >
            {searchLoading ? "..." : "Search"}
          </Button>
        </div>

        {searchResults.length > 0 && !selectedUserToAdd && (
          <div className="mb-3 max-h-40 overflow-y-auto border rounded-md p-1">
            <ul className="space-y-1">
              {searchResults.map((user) => (
                <li
                  key={user.id}
                  onClick={() => {
                    setSelectedUserToAdd(user);
                    clearMessages();
                    inviteCollaboratorMutation.reset();
                  }}
                  className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm"
                >
                  <p className="font-semibold">{user.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {user.email}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {selectedUserToAdd && (
          <div className="p-2 bg-blue-50 dark:bg-gray-700 border border-blue-200 dark:border-gray-600 rounded-md">
            <p className="text-sm font-medium mb-1">Invite this user?</p>
            <p className="font-semibold text-sm">{selectedUserToAdd.name}</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
              {selectedUserToAdd.email}
            </p>
            <Button
              onClick={handleInviteCollaborator}
              disabled={
                inviteCollaboratorMutation.isPending ||
                removeCollaboratorMutation.isPending
              }
              className="w-full mb-1"
              size="sm"
            >
              {inviteCollaboratorMutation.isPending
                ? "Inviting..."
                : `Invite ${selectedUserToAdd.name}`}
            </Button>
            <Button
              onClick={() => {
                setSelectedUserToAdd(null);
                clearMessages();
                inviteCollaboratorMutation.reset();
              }}
              disabled={
                inviteCollaboratorMutation.isPending ||
                removeCollaboratorMutation.isPending
              }
              variant="ghost"
              size="sm"
              className="w-full text-xs"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-md font-semibold mb-2">Invite by Email</h3>
        <InviteByEmailForm
          listId={listId}
          onSuccess={(invitation) => {
            setInvitations((prev) => [...prev, invitation]);
            setSuccessMessage(`Invitation sent.`);
          }}
          onError={(msg) => setError(msg)}
        />
      </div>

      <a
        href={`/lists/collaborators#list-${listId}`}
        className="block text-sm text-blue-600 hover:underline dark:text-blue-400"
      >
        Manage all →
      </a>
    </div>
  );
}
