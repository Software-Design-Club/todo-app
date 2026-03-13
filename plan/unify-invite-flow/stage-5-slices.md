---
slices: true
---

# Unify Invite Flow — Slices

**Stage:** 5 — Slicing Work
**Date:** 2026-03-13
**Status:** Draft

---

## Source Traceability

| Artifact | Path |
|----------|------|
| Frame | `plan/unify-invite-flow/stage-1-frame.md` |
| Shape | `plan/unify-invite-flow/stage-2-shape.md` |
| Breadboard | `plan/unify-invite-flow/stage-3-breadboard.md` |
| Draft Spec | `plan/unify-invite-flow/stage-4-draft-spec.md` |

---

## Dependency Map

```
Slice A (email normalization)  ──┐
                                  ├──► Slice C (invite routing) ──► Slice D (optimistic UI)
Slice B (search action)        ──┘
```

**A and B are independent and can run in parallel.**
**C depends on B (search action must exist before invite mutation is wired).**
**D depends on C (mutation must be in place before optimistic update is added).**

---

## Slice A — Email normalization at account creation

**Depends on:** Nothing
**Runs parallel with:** Slice B

### Objective

Normalize user email at write time in `findOrCreateAccount` so that `UsersTable.email` can be equality-joined against `invitations.invitedEmailNormalized` without case gymnastics.

### Included Behaviors

| Behavior | Description |
|----------|-------------|
| B6 | `findOrCreateAccount` trims and lowercases the email value before inserting into `UsersTable` |

### Demo Scenario

Create (or simulate) a new user account using a mixed-case email (e.g. `Alice@Example.com`). Inspect the resulting row in `UsersTable`. The stored email is `alice@example.com`.

### Acceptance Criteria

- `UsersTable.email` for a newly created account is lowercase and has no leading/trailing whitespace
- Existing accounts are not affected
- No migration runs

### Out-of-Scope Edges

- Backfill of existing `UsersTable` emails — explicitly out of bounds per shape
- Email normalization outside the `findOrCreateAccount` path

---

## Slice B — `searchInvitableUsers` server action

**Depends on:** Nothing
**Runs parallel with:** Slice A

### Objective

Replace the existing `searchUsers` call with a new `searchInvitableUsers(term, listId)` server action that applies both exclusion filters server-side. The UI receives a pre-filtered result list.

### Included Behaviors

| Behavior | Description |
|----------|-------------|
| B2 | Results exclude existing collaborators and users with open (`sent`/`pending`) invitations for this list — both enforced in a single server-side query |

### Demo Scenario

1. User A is already an accepted collaborator on list L.
2. User B has an open (`sent`) invitation for list L.
3. User C has no connection to list L.

Search with a term matching A, B, and C. Results show only C.

The empty-results message is a single generic string regardless of which exclusion removed a result.

### Acceptance Criteria

- `searchInvitableUsers` performs a single DB query with exclusion subqueries (no client-side filtering)
- Existing collaborators are absent from results
- Users with open invitations are absent from results
- Users with no connection appear in results
- Empty results produce one generic message, not separate "no match" vs "all excluded" messages

### Out-of-Scope Edges

- Client-side filtering of any kind
- Distinguishing between the two exclusion reasons in the UI

---

## Slice C — Search-select routes through invitation workflow

**Depends on:** Slice B (`searchInvitableUsers` must be wired before the mutation fires)

### Objective

Replace the `addCollaborator` call in `manage-collaborators.tsx` with `inviteCollaborator`. Rename the CTA. Handle errors using the email-form toast pattern. Delete `addCollaborator`.

### Included Behaviors

| Behavior | Description |
|----------|-------------|
| B1 | Selecting a user from search results triggers `inviteCollaboratorWorkflow`; no row inserted into `list_collaborators` at selection time |
| B4 | Confirmation button reads "Invite {name}"; disabled and shows loading label while in-flight |
| B5 | Invitation uses existing email template and status values; no new invitation states |
| B7 | Delivery failure shows `"Invitation saved but email delivery failed: {errorMessage}"`; action failure shows error message or `"Failed to send invitation."`; search panel state is NOT reset on failure |
| B8 | `inviteCollaborator` enforces owner permission server-side independently; unauthorized direct call throws `CollaboratorManagementPermissionDeniedError` |
| B10 | `addCollaborator` server action is deleted |

### Demo Scenario

1. Owner opens "Manage Collaborators" dropdown on a list they own.
2. Searches for an existing app user not yet invited.
3. Selects the user from results — confirmation panel appears with "Invite {name}" button.
4. Clicks "Invite {name}".
5. Invitation record is created; invitation email is sent.
6. No row exists in `list_collaborators` for this user.
7. (Pending list update via `router.refresh()` — full optimistic behavior is Slice D.)

For error path: simulate delivery failure → toast shows `"Invitation saved but email delivery failed: {msg}"`; search panel state is preserved.

### Acceptance Criteria

- `addCollaborator` does not exist in the codebase; TypeScript build passes
- Successful invite creates an invitation record and sends email; no `list_collaborators` insert
- CTA label is "Invite {name}" and shows loading state while in-flight
- Delivery failure toast matches B7 spec
- Action failure toast matches B7 spec
- Search panel state is preserved on failure
- Direct call to `inviteCollaborator` without owner permission throws the expected error

### Out-of-Scope Edges

- Optimistic pending invitations update (Slice D)
- Invitation management controls (revoke, resend, copy-link) — those live on the collaborators page

---

## Slice D — Optimistic pending-invitations update

**Depends on:** Slice C (`inviteCollaborator` mutation must be in place)

### Objective

Lift `invitations` to `useState<InvitationSummary[]>` in `ManageCollaborators`. Wire `onSuccess` in the search mutation to append an explicit `SentInvitationSummary` to local state. Add an `onSuccess` callback prop to `InviteByEmailForm` and guard `router.refresh()` so both paths update the pending list without a page reload.

### Included Behaviors

| Behavior | Description |
|----------|-------------|
| B3 | After a successful search-select invite, the pending invitations section shows a new entry without a page reload or dropdown close; search panel resets (input, results, confirmation panel cleared) |
| B9 | `InviteByEmailForm` receives `onSuccess: (invitation: SentInvitationSummary) => void` prop; when provided, it calls it with a typed `SentInvitationSummary` and skips `router.refresh()`; when absent (e.g. collaborators page), `router.refresh()` still runs |

### Demo Scenario

**Search-select path:**
1. Owner invites a user via search-select.
2. Pending invitations list immediately shows the new entry (typed as `SentInvitationSummary`).
3. Search input clears; results list clears; confirmation panel closes.
4. No page reload; dropdown stays open.

**Email form path:**
1. Owner invites a user via the email invite form inside the dropdown.
2. Pending invitations list immediately shows the new entry.
3. No page reload; dropdown stays open.

**Collaborators page (regression check):**
1. `InviteByEmailForm` is rendered on `/lists/collaborators` without `onSuccess`.
2. After a successful invite, `router.refresh()` still runs as before.

### Acceptance Criteria

- `invitations` local state type is `useState<InvitationSummary[]>` (full union)
- `onSuccess` constructs and appends an explicitly typed `SentInvitationSummary` (not the union type) — structural match alone is not acceptable
- Search panel clears (input, results, confirmation) on success
- Dropdown does not close after invite
- No `router.refresh()` fired inside the dropdown on success
- `InviteByEmailForm` on the collaborators page still calls `router.refresh()` after success (no regression)
- No `useEffect` added to sync props into state

### Out-of-Scope Edges

- Invitation management controls (revoke, resend, copy-link)
- Visual redesign of the search panel or email form

---

## Slice Sequence Summary

| Order | Slice | Key Behaviors | Parallelizable |
|-------|-------|--------------|----------------|
| 1a | A — Email normalization | B6 | Yes (with B) |
| 1b | B — `searchInvitableUsers` | B2 | Yes (with A) |
| 2 | C — Invite routing | B1, B4, B5, B7, B8, B10 | No (needs B) |
| 3 | D — Optimistic UI | B3, B9 | No (needs C) |

---

## Readiness Check

| Check | Status |
|-------|--------|
| Every slice is vertical and demoable | ✅ |
| Slice order is explicit and justified | ✅ |
| Acceptance hooks exist per slice | ✅ |
| Critical risk behavior (delivery failure, permission) in early slice (C) | ✅ |
| No infra-only slices | ✅ |
| No shaped intent redefined | ✅ |
| No boundaries that force broad rework in later slices | ✅ |
