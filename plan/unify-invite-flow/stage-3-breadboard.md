---
breadboarding: true
conversational: true
---

# Unify Invite Flow — Conversational Breadboard

**Stage:** 3 — Breadboarding
**Date:** 2026-03-13
**Status:** Approved

---

## Breadboard Scope

- **Workflow:** List owner searches for an existing app user and invites them as a collaborator, routing through the invitation workflow instead of a direct DB insert
- **Entry point:** "Manage Collaborators" dropdown on the list detail page (`/lists/[listId]`) — search panel
- **Expected outcome:** Owner sees new pending invitation in the open invitations list inside the dropdown; invitee receives an email; `addCollaborator` is deleted
- **Boundaries:** Single system — `manage-collaborators.tsx`, `collaborators.ts` actions, `invitations.ts` action, invitation service

---

## Places

| # | Place | Description |
|---|-------|-------------|
| P1 | ManageCollaboratorsSection | "Manage Collaborators" dropdown on the list detail page — contains search panel, pending invitations list, and email invite form |
| P2 | PendingInvitationsList | Open invitations display rendered inside the same dropdown (already exists) |
| P3 | CollaboratorsPage | `/lists/collaborators` — owner's invitation management hub (revoke, resend, approve, copy link) |

---

## UI Affordances

| # | Place | Component | Affordance | Control | Wires Out | Returns To |
|---|-------|-----------|------------|---------|-----------|------------|
| U1 | P1 | `manage-collaborators.tsx` | Search input | Text field | Updates `searchTerm` state | P1 |
| U2 | P1 | `manage-collaborators.tsx` | Search button | Button | Fires N1 | P1 — renders U3 items |
| U3 | P1 | `manage-collaborators.tsx` | Search result item | Button (per result) | Sets `selectedUserToAdd` state | P1 — shows confirmation panel |
| U4 | P1 | `manage-collaborators.tsx` | Invite button (was "Add {name}") | Button | Fires N2 | P1 — on success: appends to `invitations` state, clears `selectedUserToAdd` + `searchResults` |
| U5 | P1 | `manage-collaborators.tsx` | Cancel button | Button | Clears `selectedUserToAdd` | P1 — back to search results |
| U6 | P1 | `manage-collaborators.tsx` | "Manage all →" link (existing, no change) | Anchor | Navigates to `/lists/collaborators#list-{listId}` | P3 |
| U7 | P2 | `pending-invitations-list.tsx` | Pending invitations display | Read-only list | — | — |

---

## Code Affordances

| # | Place | Component | Affordance | Control | Wires Out | Returns To |
|---|-------|-----------|------------|---------|-----------|------------|
| N1 | P1 | `searchInvitableUsers(term, listId)` (new — replaces `searchUsers`) | Query `todo_users` excluding existing collaborators and users with open (`sent`/`pending`) invitations for this list — both exclusions server-side | Server action | Reads D1, D2 | U2 → populates U3 items |
| N2 | P1 | `inviteCollaborator(listId, email)` (existing server action — replaces `addCollaborator` call) | Normalize email, write invitation record, send email | `useMutation` via TanStack Query | Writes D3 | U4 `onSuccess` → constructs explicit `SentInvitationSummary` (typed from `lib/types.ts`), appends to local `invitations` state; no `router.refresh()` |

---

## Data Stores

| # | Place | Store | Description |
|---|-------|-------|-------------|
| D1 | N1 | `todo_users` | Source of searchable app users |
| D2 | N1 | `invitations` | Read: exclude users with open (`sent`/`pending`) invitations for this list |
| D3 | N2 | `invitations` | Write: new invitation row issued by `inviteCollaboratorWorkflow` |

---

## Decision Log

- **No `router.refresh()`** — `ManageCollaborators` is inside a Radix `DropdownMenu`; a server re-render would update `initialInvitations` via prop but not update local `useState`, and risks fragile reconciliation. Local state is the source of truth within the session.
- **`invitations` state holds `InvitationSummary[]` (the full union)** — `PendingInvitationsList` can display both `SentInvitationSummary` and `PendingApprovalInvitationSummary`. The local state type must be `useState<InvitationSummary[]>(initialInvitations)`. However, the object constructed in `onSuccess` must be explicitly typed as `SentInvitationSummary` (imported from `lib/types.ts`), not the union — because a newly sent invitation is always of that kind. Structural match alone is not acceptable.
- **Both exclusions server-side in `searchInvitableUsers`** — single DB query excludes existing collaborators and users with open invitations; no client-side filtering.
- **`addCollaborator` deleted** — dead code after this change; deletion is part of the same change set.
- **CTA renamed "Add {name}" → "Invite {name}"** — aligns label with the new invitation semantics.
- **"Manage all →" link unchanged** — already exists and already deep-links to `/lists/collaborators#list-{listId}`.
- **`useMutation` pattern reused** — TanStack Query already present; `addCollaboratorMutation` replaced by `inviteCollaboratorMutation` following the same shape.
- **No new `useEffect`** — state update is handled entirely in `onSuccess`; no effect needed to sync props.

---

## Open Questions

None.

---

## Approval Record

- **Reviewer:** Emmanuel
- **Date:** 2026-03-13
- **Result:** Approved
- **Notes:** Confirmed `invitations` state type is `InvitationSummary[]` (full union); `onSuccess` constructs explicitly typed `SentInvitationSummary`. No open questions remaining.
