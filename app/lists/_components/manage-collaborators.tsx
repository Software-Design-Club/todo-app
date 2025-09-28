"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/ui/button";
import { useMutation } from "@tanstack/react-query";
import type { User, List, ListUser } from "@/lib/types";
import { CollaboratorListItem } from "./collaborator-list-item";

interface ManageCollaboratorsProps {
  listId: List["id"];
  initialCollaborators: ListUser[];
  searchUsers: (searchTerm: string) => Promise<User[]>;
  addCollaborator: (user: User, listId: List["id"]) => Promise<ListUser>;
  removeCollaborator: (userId: User["id"], listId: List["id"]) => Promise<void>;
}

export default function ManageCollaborators({
  listId,
  initialCollaborators,
  searchUsers,
  addCollaborator,
  removeCollaborator,
}: ManageCollaboratorsProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedUserToAdd, setSelectedUserToAdd] = useState<User | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currentCollaborators, setCurrentCollaborators] =
    useState<ListUser[]>(initialCollaborators);

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

  const addCollaboratorMutation = useMutation({
    mutationFn: (user: User) => addCollaborator(user, listId),
    onSuccess: (addedUser: ListUser, user: User) => {
      setSuccessMessage(`${user.name} added as a collaborator.`);

      setCurrentCollaborators((prev) => {
        if (!prev.find((c) => c.User.id === addedUser.User.id)) {
          return [...prev, addedUser];
        }
        return prev;
      });

      setSelectedUserToAdd(null);
      setSearchTerm("");
      setSearchResults([]);
      setError(null);
      // queryClient.invalidateQueries({ queryKey: ["list", listId, "collaborators"] }); // Example if you fetch collaborators separately
    },
    onError: (error: Error) => {
      setError(
        `Failed to add ${selectedUserToAdd?.name || "user"}. ${
          error.message || "Please try again."
        }`
      );
      setSuccessMessage(null);
    },
  });

  const removeCollaboratorMutation = useMutation({
    mutationFn: (userId: User["id"]) => removeCollaborator(userId, listId),
    onSuccess: (_, userId: User["id"]) => {
      const removedUser = currentCollaborators.find(
        (c) => c.User.id === userId
      );
      setSuccessMessage(
        `${removedUser?.User.name || "User"} removed successfully.`
      );
      setCurrentCollaborators((prev) =>
        prev.filter((user) => user.User.id !== userId)
      );
      setError(null);
      // queryClient.invalidateQueries({ queryKey: ["list", listId, "collaborators"] });
    },
    onError: (error: Error, userId: User["id"]) => {
      const user = currentCollaborators.find((c) => c.User.id === userId);
      setError(
        `Failed to remove ${user?.User.name || "user"}. ${
          error.message || "Please try again."
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
      const users = await searchUsers(searchTerm);
      // Filter out users who are already collaborators
      const newResults = users.filter(
        (user) => !currentCollaborators.some((c) => c.User.id === user.id)
      );
      setSearchResults(newResults);
      if (newResults.length === 0 && users.length > 0) {
        setError(
          "All found users are already collaborators or user not found."
        );
      } else if (users.length === 0) {
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

  const handleAddCollaborator = () => {
    if (selectedUserToAdd) {
      clearMessages();
      addCollaboratorMutation.mutate(selectedUserToAdd);
    }
  };

  const handleRemoveCollaborator = (userId: User["id"]) => {
    clearMessages();
    removeCollaboratorMutation.mutate(userId);
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
                  removeCollaboratorMutation.variables === collaborator.User.id
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

      <div>
        <h3 className="text-md font-semibold mb-2">Add New Collaborator</h3>
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
                !addCollaboratorMutation.isPending &&
                !searchLoading
              ) {
                handleSearch();
              }
            }}
            placeholder="Search by name or email"
            className="border border-gray-300 p-2 rounded-md text-sm flex-grow focus:ring-2 focus:ring-blue-500 outline-none dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            disabled={
              addCollaboratorMutation.isPending ||
              searchLoading ||
              removeCollaboratorMutation.isPending
            }
          />
          <Button
            onClick={handleSearch}
            disabled={
              searchLoading ||
              !searchTerm.trim() ||
              addCollaboratorMutation.isPending ||
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
                    addCollaboratorMutation.reset();
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
            <p className="text-sm font-medium mb-1">Add this user?</p>
            <p className="font-semibold text-sm">{selectedUserToAdd.name}</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
              {selectedUserToAdd.email}
            </p>
            <Button
              onClick={handleAddCollaborator}
              disabled={
                addCollaboratorMutation.isPending ||
                removeCollaboratorMutation.isPending
              }
              className="w-full mb-1"
              size="sm"
            >
              {addCollaboratorMutation.isPending
                ? "Adding..."
                : `Add ${selectedUserToAdd.name}`}
            </Button>
            <Button
              onClick={() => {
                setSelectedUserToAdd(null);
                clearMessages();
                addCollaboratorMutation.reset();
              }}
              disabled={
                addCollaboratorMutation.isPending ||
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
    </div>
  );
}
