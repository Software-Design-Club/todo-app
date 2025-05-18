"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/ui/button";
import { useMutation } from "@tanstack/react-query";
import type { User } from "@/app/lists/_actions/collaborators"; // Import User type from server actions

interface InviteCollaboratorsProps {
  listId: string;
  // These props are now server actions passed from a server component
  searchUsers: (searchTerm: string) => Promise<User[]>;
  addCollaborator: (userId: string, listId: string) => Promise<void>; // Updated signature for useMutation
}

export default function InviteCollaborators({
  listId,
  searchUsers,
  addCollaborator,
}: InviteCollaboratorsProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const addCollaboratorMutation = useMutation({
    mutationFn: (userId: string) => addCollaborator(userId, listId), // The server action
    onSuccess: () => {
      setSuccessMessage(
        `${selectedUser?.name || "User"} added as a collaborator.`
      );
      setSelectedUser(null);
      setSearchTerm("");
      setSearchResults([]);
      // TODO: Consider invalidating queries that fetch list collaborators to update UI elsewhere
      // queryClient.invalidateQueries(['listCollaborators', listId]);
    },
    onError: (error: Error) => {
      // The error from useMutation is a generic Error, server action might throw specific errors
      setSearchError(
        `Failed to add ${selectedUser?.name || "user"}. ${
          error.message || "Please try again."
        }`
      );
    },
  });

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      setSelectedUser(null);
      setSearchError(null);
      setSuccessMessage(null);
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    setSuccessMessage(null);
    setSelectedUser(null);
    setSearchResults([]);

    try {
      const users = await searchUsers(searchTerm);
      setSearchResults(users);
      if (users.length === 0) {
        setSearchError("No users found.");
      }
    } catch (err: unknown) {
      console.error("Error searching users:", err);
      let errorMessage = "Search failed. Try again.";
      if (err instanceof Error) {
        errorMessage = err.message;
      }
      setSearchError(errorMessage);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleAddCollaborator = () => {
    if (selectedUser) {
      setSuccessMessage(null); // Clear previous success message
      setSearchError(null); // Clear previous error message
      addCollaboratorMutation.mutate(selectedUser.id);
    }
  };

  // Effect to clear messages when component might be re-shown or listId changes
  useEffect(() => {
    setSuccessMessage(null);
    setSearchError(null);
  }, [listId]);

  return (
    <div className="p-2">
      {successMessage && !addCollaboratorMutation.isError && (
        <div className="mb-2 p-2 bg-green-100 border border-green-300 text-green-700 rounded-md text-sm">
          {successMessage}
        </div>
      )}
      {/* Display mutation error or search error */}
      {(addCollaboratorMutation.isError || searchError) && (
        <div className="mb-2 p-2 bg-red-100 border border-red-300 text-red-700 rounded-md text-sm">
          {addCollaboratorMutation.error?.message || searchError}
        </div>
      )}

      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setSuccessMessage(null);
            if (e.target.value.trim() === "") {
              setSearchError(null);
              setSearchResults([]);
              setSelectedUser(null);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !addCollaboratorMutation.isPending) {
              handleSearch();
            }
          }}
          placeholder="Search by name or email"
          className="border border-gray-300 p-2 rounded-md text-sm flex-grow focus:ring-2 focus:ring-blue-500 outline-none dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          disabled={addCollaboratorMutation.isPending || searchLoading}
        />
        <Button
          onClick={handleSearch}
          disabled={
            searchLoading ||
            !searchTerm.trim() ||
            addCollaboratorMutation.isPending
          }
          variant="outline"
          size="sm"
        >
          {searchLoading ? "..." : "Search"}
        </Button>
      </div>

      {searchResults.length > 0 && !selectedUser && (
        <div className="mb-3 max-h-40 overflow-y-auto border rounded-md p-1">
          <ul className="space-y-1">
            {searchResults.map((user) => (
              <li
                key={user.id}
                onClick={() => {
                  setSelectedUser(user);
                  setSuccessMessage(null);
                  setSearchError(null); // Clear search error on selection
                  addCollaboratorMutation.reset(); // Reset mutation state if user selects another user
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

      {selectedUser && (
        <div className="p-2 bg-blue-50 dark:bg-gray-700 border border-blue-200 dark:border-gray-600 rounded-md">
          <p className="text-sm font-medium mb-1">Add this user?</p>
          <p className="font-semibold text-sm">{selectedUser.name}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
            {selectedUser.email}
          </p>
          <Button
            onClick={handleAddCollaborator}
            disabled={addCollaboratorMutation.isPending}
            className="w-full mb-1"
            size="sm"
          >
            {addCollaboratorMutation.isPending
              ? "Adding..."
              : `Add ${selectedUser.name}`}
          </Button>
          <Button
            onClick={() => {
              setSelectedUser(null);
              setSuccessMessage(null);
              setSearchError(null);
              addCollaboratorMutation.reset(); // Clear any mutation state
            }}
            disabled={addCollaboratorMutation.isPending}
            variant="ghost"
            size="sm"
            className="w-full text-xs"
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
