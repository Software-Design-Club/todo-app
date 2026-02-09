"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/ui/button";
import { useMutation } from "@tanstack/react-query";
import type { User, List, ListInvitation, ListUser } from "@/lib/types";
import { CollaboratorListItem } from "./collaborator-list-item";
import {
  searchUsers,
  addCollaborator,
  removeCollaborator,
} from "@/app/lists/_actions/collaborators";
import {
  createInvitationForList,
  resendInvitationForList,
  revokeInvitationForList,
  approveInvitationForList,
  rejectInvitationForList,
} from "@/app/lists/_actions/invitations";
import { INVITATION_STATUS } from "@/lib/invitations/constants";

interface ManageCollaboratorsProps {
  listId: List["id"];
  initialCollaborators: ListUser[];
  initialInvitations?: ListInvitation[];
}

export default function ManageCollaborators({
  listId,
  initialCollaborators,
  initialInvitations = [],
}: ManageCollaboratorsProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedUserToAdd, setSelectedUserToAdd] = useState<User | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currentCollaborators, setCurrentCollaborators] =
    useState<ListUser[]>(initialCollaborators);
  const [currentInvitations, setCurrentInvitations] =
    useState<ListInvitation[]>(initialInvitations);

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
    mutationFn: (listUser: ListUser) =>
      removeCollaborator({
        listId: listUser.listId,
        collaboratorUserId: listUser.User.id,
      }),
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
      // queryClient.invalidateQueries({ queryKey: ["list", listId, "collaborators"] });
    },
    onError: (error: Error, listUser: ListUser) => {
      const user = currentCollaborators.find(
        (c) => c.User.id === listUser.User.id
      );
      setError(
        `Failed to remove ${user?.User.name || "user"}. ${
          error.message || "Please try again."
        }`
      );
      setSuccessMessage(null);
    },
  });

  const createInvitationMutation = useMutation({
    mutationFn: (invitedEmail: string) =>
      createInvitationForList({
        listId,
        invitedEmail,
      }),
    onSuccess: (data) => {
      if (!data?.invitation) {
        setSuccessMessage(null);
        setError("Invitation created but response was invalid.");
        return;
      }
      const { invitation } = data;

      setCurrentInvitations((previousInvitations) => {
        const inviteIndex = previousInvitations.findIndex(
          (existingInvite) => existingInvite.id === invitation.id
        );
        if (inviteIndex === -1) {
          return [invitation, ...previousInvitations];
        }

        const nextInvitations = [...previousInvitations];
        nextInvitations[inviteIndex] = invitation;
        return nextInvitations;
      });

      setInviteEmail("");
      if (invitation.emailDeliveryStatus === "failed") {
        setError("Email delivery failed. You can copy the invite link instead.");
        setSuccessMessage(null);
      } else {
        setError(null);
        setSuccessMessage(
          `Invitation sent to ${invitation.invitedEmailNormalized}.`
        );
      }
    },
    onError: (mutationError: Error) => {
      setSuccessMessage(null);
      setError(
        mutationError.message || "Failed to send invitation. Please try again."
      );
    },
  });

  const resendInvitationMutation = useMutation({
    mutationFn: (params: {
      invitationId: ListInvitation["id"];
      copyAfterResend?: boolean;
    }) =>
      resendInvitationForList({
        invitationId: params.invitationId,
        listId,
      }).then((response) => ({ ...response, copyAfterResend: params.copyAfterResend })),
    onSuccess: async (data) => {
      if (!data?.invitation || !data.inviteLink) {
        setSuccessMessage(null);
        setError("Invitation resent but response was invalid.");
        return;
      }
      const { invitation, inviteLink, copyAfterResend } = data;

      setCurrentInvitations((previousInvitations) =>
        previousInvitations.map((existingInvite) =>
          existingInvite.id === invitation.id ? invitation : existingInvite
        )
      );

      if (copyAfterResend) {
        try {
          await navigator.clipboard.writeText(inviteLink);
          setSuccessMessage("Invite link copied to clipboard.");
        } catch {
          setSuccessMessage(`Could not copy to clipboard. Link: ${inviteLink}`);
        }
      } else {
        setSuccessMessage(
          `Invitation resent to ${invitation.invitedEmailNormalized}.`
        );
      }
      setError(null);
    },
    onError: (mutationError: Error) => {
      setSuccessMessage(null);
      setError(
        mutationError.message || "Failed to resend invitation. Please try again."
      );
    },
  });

  const revokeInvitationMutation = useMutation({
    mutationFn: (invitationId: ListInvitation["id"]) =>
      revokeInvitationForList({
        invitationId,
        listId,
      }),
    onSuccess: (invitation) => {
      if (!invitation) {
        setSuccessMessage(null);
        setError("Invitation revoked but response was invalid.");
        return;
      }
      setCurrentInvitations((previousInvitations) =>
        previousInvitations.map((existingInvite) =>
          existingInvite.id === invitation.id ? invitation : existingInvite
        )
      );
      setError(null);
      setSuccessMessage("Invitation revoked.");
    },
    onError: (mutationError: Error) => {
      setSuccessMessage(null);
      setError(
        mutationError.message || "Failed to revoke invitation. Please try again."
      );
    },
  });

  const approveInvitationMutation = useMutation({
    mutationFn: (invitationId: ListInvitation["id"]) =>
      approveInvitationForList({
        invitationId,
        listId,
      }),
    onSuccess: (invitation) => {
      if (!invitation) {
        setSuccessMessage(null);
        setError("Invitation approved but response was invalid.");
        return;
      }
      setCurrentInvitations((previousInvitations) =>
        previousInvitations.map((existingInvite) =>
          existingInvite.id === invitation.id ? invitation : existingInvite
        )
      );
      setError(null);
      setSuccessMessage("Invitation approved.");
    },
    onError: (mutationError: Error) => {
      setSuccessMessage(null);
      setError(
        mutationError.message || "Failed to approve invitation. Please try again."
      );
    },
  });

  const rejectInvitationMutation = useMutation({
    mutationFn: (invitationId: ListInvitation["id"]) =>
      rejectInvitationForList({
        invitationId,
        listId,
      }),
    onSuccess: (invitation) => {
      if (!invitation) {
        setSuccessMessage(null);
        setError("Invitation rejected but response was invalid.");
        return;
      }
      setCurrentInvitations((previousInvitations) =>
        previousInvitations.map((existingInvite) =>
          existingInvite.id === invitation.id ? invitation : existingInvite
        )
      );
      setError(null);
      setSuccessMessage("Invitation rejected.");
    },
    onError: (mutationError: Error) => {
      setSuccessMessage(null);
      setError(
        mutationError.message || "Failed to reject invitation. Please try again."
      );
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

  const handleRemoveCollaborator = (listUser: ListUser) => {
    clearMessages();
    removeCollaboratorMutation.mutate(listUser);
  };

  const handleCreateInvitation = () => {
    if (inviteEmail.trim()) {
      clearMessages();
      createInvitationMutation.mutate(inviteEmail.trim());
    }
  };

  const invitationGroups = useMemo(() => {
    const pending: ListInvitation[] = [];
    const pendingApproval: ListInvitation[] = [];

    for (const invitation of currentInvitations) {
      if (invitation.inviteStatus === INVITATION_STATUS.SENT) {
        pending.push(invitation);
      } else if (invitation.inviteStatus === INVITATION_STATUS.PENDING_APPROVAL) {
        pendingApproval.push(invitation);
      }
    }

    return { pending, pendingApproval };
  }, [currentInvitations]);

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

      <div>
        <h3 className="text-md font-semibold mb-2">Invite by Email</h3>
        <div className="flex gap-2 mb-3">
          <input
            type="email"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="user@example.com"
            className="border border-gray-300 p-2 rounded-md text-sm flex-grow focus:ring-2 focus:ring-blue-500 outline-none dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            disabled={createInvitationMutation.isPending}
          />
          <Button
            onClick={handleCreateInvitation}
            disabled={
              createInvitationMutation.isPending || !inviteEmail.trim().length
            }
            size="sm"
          >
            {createInvitationMutation.isPending ? "Inviting..." : "Invite"}
          </Button>
        </div>
      </div>

      <div>
        <h3 className="text-md font-semibold mb-2">Pending Invitations</h3>
        {invitationGroups.pending.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No pending email invitations.
          </p>
        ) : (
          <ul className="space-y-2 max-h-40 overflow-y-auto">
            {invitationGroups.pending.map((invitation) => (
              <li
                key={invitation.id}
                className="rounded-md border p-2 text-sm dark:bg-gray-700 dark:border-gray-600"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{invitation.invitedEmailNormalized}</p>
                    <p className="text-xs text-muted-foreground">
                      status: {invitation.inviteStatus}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        resendInvitationMutation.mutate({
                          invitationId: invitation.id,
                        })
                      }
                      disabled={resendInvitationMutation.isPending}
                    >
                      Resend
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        resendInvitationMutation.mutate({
                          invitationId: invitation.id,
                          copyAfterResend: true,
                        })
                      }
                      disabled={resendInvitationMutation.isPending}
                    >
                      Copy Link
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        revokeInvitationMutation.mutate(invitation.id)
                      }
                      disabled={revokeInvitationMutation.isPending}
                    >
                      Revoke
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-md font-semibold mb-2">Owner Approvals</h3>
        {invitationGroups.pendingApproval.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No invitations are awaiting owner approval.
          </p>
        ) : (
          <ul className="space-y-2 max-h-40 overflow-y-auto">
            {invitationGroups.pendingApproval.map((invitation) => (
              <li
                key={invitation.id}
                className="rounded-md border p-2 text-sm dark:bg-gray-700 dark:border-gray-600"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{invitation.invitedEmailNormalized}</p>
                    <p className="text-xs text-muted-foreground">
                      requested user id: {invitation.userId ?? "unknown"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => approveInvitationMutation.mutate(invitation.id)}
                      disabled={approveInvitationMutation.isPending}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => rejectInvitationMutation.mutate(invitation.id)}
                      disabled={rejectInvitationMutation.isPending}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
