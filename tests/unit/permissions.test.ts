import { describe, expect, it } from "vitest";
import {
  canBeRemovedAsCollaborator,
  canViewList,
  isAuthorizedToChangeVisibility,
  isAuthorizedToEditCollaborators,
  userCanEditList,
} from "@/app/lists/_actions/permissions";
import { createTaggedList, createTaggedListUser, createTaggedUserId } from "@/lib/types";

function buildList(params?: {
  id?: number;
  creatorId?: number;
  visibility?: "private" | "public";
  state?: "active" | "archived";
}) {
  return createTaggedList({
    id: params?.id ?? 1,
    title: "Team Tasks",
    creatorId: params?.creatorId ?? 1,
    visibility: params?.visibility ?? "private",
    state: params?.state ?? "active",
    createdAt: new Date("2026-02-11T00:00:00.000Z"),
    updatedAt: new Date("2026-02-11T00:00:00.000Z"),
  });
}

function buildListUser(params: {
  id: number;
  role: "owner" | "collaborator";
  listId?: number;
}) {
  return createTaggedListUser({
    id: params.id,
    name: `User ${params.id}`,
    email: `user${params.id}@example.com`,
    role: params.role,
    listId: params.listId ?? 1,
  });
}

describe("permissions", () => {
  it("userCanEditList allows owners and collaborators, but not non-members", () => {
    const collaborators = [
      buildListUser({ id: 1, role: "owner" }),
      buildListUser({ id: 2, role: "collaborator" }),
    ];

    expect(userCanEditList(collaborators, createTaggedUserId(1))).toBe(true);
    expect(userCanEditList(collaborators, createTaggedUserId(2))).toBe(true);
    expect(userCanEditList(collaborators, createTaggedUserId(3))).toBe(false);
    expect(userCanEditList(collaborators, null)).toBe(false);
  });

  it("isAuthorizedToEditCollaborators only allows owners", () => {
    const collaborators = [
      buildListUser({ id: 1, role: "owner" }),
      buildListUser({ id: 2, role: "collaborator" }),
    ];

    expect(
      isAuthorizedToEditCollaborators(collaborators, createTaggedUserId(1))
    ).toBe(true);
    expect(
      isAuthorizedToEditCollaborators(collaborators, createTaggedUserId(2))
    ).toBe(false);
  });

  it("canBeRemovedAsCollaborator blocks owner removal and allows collaborator removal", () => {
    expect(canBeRemovedAsCollaborator(buildListUser({ id: 1, role: "owner" }))).toBe(
      false
    );
    expect(
      canBeRemovedAsCollaborator(buildListUser({ id: 2, role: "collaborator" }))
    ).toBe(true);
  });

  it("isAuthorizedToChangeVisibility only allows owners", () => {
    const collaborators = [
      buildListUser({ id: 1, role: "owner" }),
      buildListUser({ id: 2, role: "collaborator" }),
    ];

    expect(
      isAuthorizedToChangeVisibility(collaborators, createTaggedUserId(1))
    ).toBe(true);
    expect(
      isAuthorizedToChangeVisibility(collaborators, createTaggedUserId(2))
    ).toBe(false);
  });

  it("canViewList allows private lists only to collaborators", () => {
    const privateList = buildList({ visibility: "private", state: "active" });
    const collaborators = [buildListUser({ id: 1, role: "owner" })];

    expect(canViewList(privateList, collaborators, createTaggedUserId(1))).toBe(true);
    expect(canViewList(privateList, collaborators, createTaggedUserId(9))).toBe(false);
    expect(canViewList(privateList, collaborators, null)).toBe(false);
  });

  it("canViewList allows public lists to everyone and archived lists only to owners", () => {
    const collaborators = [
      buildListUser({ id: 1, role: "owner" }),
      buildListUser({ id: 2, role: "collaborator" }),
    ];
    const publicList = buildList({ visibility: "public", state: "active" });
    const archivedList = buildList({ visibility: "private", state: "archived" });

    expect(canViewList(publicList, collaborators, null)).toBe(true);
    expect(canViewList(archivedList, collaborators, createTaggedUserId(1))).toBe(true);
    expect(canViewList(archivedList, collaborators, createTaggedUserId(2))).toBe(false);
  });
});
