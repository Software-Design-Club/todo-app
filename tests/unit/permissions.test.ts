import { describe, expect, it } from "vitest";
import { createTaggedList, createTaggedListUser } from "@/lib/types";
import {
  canBeRemovedAsCollaborator,
  canViewList,
  isAuthorizedToChangeVisibility,
  isAuthorizedToEditCollaborators,
  isListOwner,
  userCanEditList,
} from "@/app/lists/_actions/permissions";

describe("permissions", () => {
  const collaborators = [
    createTaggedListUser({
      id: 1,
      name: "User 1",
      email: "user1@example.com",
      role: "owner",
      listId: 1,
    }),
    createTaggedListUser({
      id: 2,
      name: "User 2",
      email: "user2@example.com",
      role: "collaborator",
      listId: 1,
    }),
  ];

  it("allows owners and collaborators to edit list content", () => {
    expect(userCanEditList(collaborators, collaborators[0].User.id)).toBe(true);
    expect(userCanEditList(collaborators, collaborators[1].User.id)).toBe(true);
    expect(
      userCanEditList(
        collaborators,
        createTaggedListUser({
          id: 3,
          name: "User 3",
          email: "user3@example.com",
          role: "collaborator",
          listId: 1,
        }).User.id
      )
    ).toBe(false);
    expect(userCanEditList(collaborators, null)).toBe(false);
  });

  it("restricts collaborator-management authorization to owners", () => {
    expect(
      isAuthorizedToEditCollaborators(collaborators, collaborators[0].User.id)
    ).toBe(true);
    expect(
      isAuthorizedToEditCollaborators(collaborators, collaborators[1].User.id)
    ).toBe(false);
  });

  it("identifies owners correctly", () => {
    expect(isListOwner(collaborators, collaborators[0].User.id)).toBe(true);
    expect(isListOwner(collaborators, collaborators[1].User.id)).toBe(false);
  });

  it("blocks removing owners but allows removing collaborators", () => {
    expect(canBeRemovedAsCollaborator(collaborators[0])).toBe(false);
    expect(canBeRemovedAsCollaborator(collaborators[1])).toBe(true);
  });

  it("restricts visibility changes to owners", () => {
    expect(
      isAuthorizedToChangeVisibility(collaborators, collaborators[0].User.id)
    ).toBe(true);
    expect(
      isAuthorizedToChangeVisibility(collaborators, collaborators[1].User.id)
    ).toBe(false);
  });

  it("evaluates list viewing rules for active and archived lists", () => {
    const privateActiveList = createTaggedList({
      id: 1,
      title: "Test List",
      creatorId: 1,
      visibility: "private",
      state: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const publicActiveList = createTaggedList({
      id: 1,
      title: "Test List",
      creatorId: 1,
      visibility: "public",
      state: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const archivedList = createTaggedList({
      id: 1,
      title: "Test List",
      creatorId: 1,
      visibility: "private",
      state: "archived",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(canViewList(privateActiveList, collaborators, null)).toBe(false);
    expect(
      canViewList(privateActiveList, collaborators, collaborators[1].User.id)
    ).toBe(true);
    expect(
      canViewList(
        privateActiveList,
        collaborators,
        createTaggedListUser({
          id: 3,
          name: "User 3",
          email: "user3@example.com",
          role: "collaborator",
          listId: 1,
        }).User.id
      )
    ).toBe(false);

    expect(canViewList(publicActiveList, collaborators, null)).toBe(true);

    expect(canViewList(archivedList, collaborators, null)).toBe(false);
    expect(
      canViewList(archivedList, collaborators, collaborators[0].User.id)
    ).toBe(true);
    expect(
      canViewList(archivedList, collaborators, collaborators[1].User.id)
    ).toBe(false);
  });
});
