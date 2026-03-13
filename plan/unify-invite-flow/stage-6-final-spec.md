---
functional-spec: true
status: final
---

# Unify Invite Flow — Final Functional Spec

**Stage:** 6 — Final Functional Spec
**Date:** 2026-03-13
**Status:** Final

---

## Source Traceability

| Artifact | Path |
|----------|------|
| Frame | `plan/unify-invite-flow/stage-1-frame.md` |
| Shape | `plan/unify-invite-flow/stage-2-shape.md` |
| Breadboard | `plan/unify-invite-flow/stage-3-breadboard.md` |
| Draft Spec | `plan/unify-invite-flow/stage-4-draft-spec.md` |
| Slices | `plan/unify-invite-flow/stage-5-slices.md` |

---

## Brainstorming Decisions Captured

| # | Decision | Source |
|---|----------|--------|
| BD1 | `inviteCollaborator` returns `InviteCollaboratorResult` — a tagged union replacing the raw workflow result | Stage 6 brainstorm |
| BD2 | `InviteCollaboratorWorkflowResult` exposes `expiresAt: InvitationExpiry` — threaded through from `issueInvitation` | Stage 6 brainstorm |
| BD3 | No `createSentInvitationSummary` helper — inline construction at the single call site (server action) is sufficient | Stage 6 brainstorm |
| BD4 | All clients of `inviteCollaborator` check `result.kind !== "success"` for the failure path — the `"accepted"` string from `emailServiceResponse` does not appear in any client | Stage 6 brainstorm |
| BD5 | Delivery failure folds into the `failure` tag — `errorMessage` is constructed server-side as `"Invitation saved but email delivery failed: {msg}"`; panel is not reset; `onSuccess` is not called | Stage 6 brainstorm |
| BD6 | Action throws (permission denied, network error, etc.) also fold into the `failure` tag — `errorMessage` is the error's `.message` if available, otherwise `"Failed to send invitation."` | Stage 6 brainstorm |

---

## 1. User Scenarios

### Scenario 1 — Owner invites an existing user via search (happy path)

1. Owner opens the "Manage Collaborators" dropdown on a list they own.
2. Owner types a search term into the search input.
3. System returns matching users who are not yet collaborators and have no open invitation for this list.
4. Owner selects a user from results. A confirmation panel appears showing "Invite {name}".
5. Owner clicks "Invite {name}". The button disables and shows a loading label.
6. System creates an invitation record and sends an invitation email via the existing workflow.
7. The confirmation panel closes. The search input and results clear. The pending invitations section shows the new entry immediately — no page reload, dropdown stays open.

### Scenario 2 — Search returns no results (filtered)

1. Owner searches for a user who is already a collaborator or has an open invitation.
2. System returns an empty list with a single generic empty-results message.
3. Owner sees the message and no result items.

### Scenario 3 — Invite fails (delivery failure)

1. Owner selects a user and clicks "Invite {name}".
2. System creates the invitation record but the email provider rejects delivery.
3. System shows a toast error: `"Invitation saved but email delivery failed: {errorMessage}"`.
4. The confirmation panel, search input, and results are preserved — owner can see the error and retry.

### Scenario 4 — Invite fails (action error)

1. Owner selects a user and clicks "Invite {name}".
2. Server action throws (e.g., permission denied, network error).
3. System shows a toast error with the error's message, or `"Failed to send invitation."` if no message is available.
4. The confirmation panel, search input, and results are preserved.

### Scenario 5 — Owner invites via email form inside dropdown (happy path)

1. Owner types an email address into the email invite form inside the dropdown.
2. Owner submits the form.
3. System creates an invitation record and sends an email.
4. The pending invitations section shows the new entry immediately — no page reload, dropdown stays open.

### Scenario 6 — Owner uses email form on the collaborators page

1. Owner submits the email invite form on `/lists/collaborators`.
2. System creates an invitation and sends an email.
3. The page refreshes via `router.refresh()` to reflect the new pending invitation.

### Scenario 7 — New user account is created

1. A new user signs up with any email casing (e.g., `Alice@Example.com`).
2. The email stored in `UsersTable` is `alice@example.com` — trimmed and lowercased.
3. Future invitation exclusion joins work without case gymnastics.

---

## 2. Business Rules

| ID | Rule |
|----|------|
| BR1 | Selecting a user from search results triggers the invitation workflow. No row is inserted into `list_collaborators` at selection time. |
| BR2 | Search results for a list exclude: (a) users who are already accepted collaborators, and (b) users whose normalized email matches an open (`sent` or `pending`) invitation for that list. Both exclusions are applied server-side in a single query. |
| BR3 | The pending invitations list inside the "Manage Collaborators" dropdown reflects successful invites immediately via local state — no page reload required. |
| BR4 | The confirmation button label is "Invite {name}" where `{name}` is the selected user's display name. |
| BR5 | The invitation uses the existing `inviteCollaboratorWorkflow` with no new email templates, invitation statuses, or invitation states. |
| BR6 | User emails written to `UsersTable` via `findOrCreateAccount` are trimmed and lowercased before the INSERT. Existing rows are not backfilled. |
| BR7 | `inviteCollaborator` returns `InviteCollaboratorResult` — a tagged union. On success it returns `{ kind: "success"; invitation: SentInvitationSummary }`. On any failure (delivery or action error) it returns `{ kind: "failure"; errorMessage: string }`. |
| BR8 | The `errorMessage` in `InviteCollaboratorResult` is constructed server-side. Delivery failure: `"Invitation saved but email delivery failed: {msg}"`. Action error: the error's `.message` or `"Failed to send invitation."`. |
| BR9 | No client of `inviteCollaborator` inspects `emailServiceResponse` directly. All clients branch on `result.kind`. |
| BR10 | `addCollaborator` server action is deleted. No code path inserts directly into `list_collaborators` for new collaborators added via the search panel. |

---

## 3. Validation Rules

| Field | Rule |
|-------|------|
| Search term | Non-empty string required before the search action fires. Client enforces this; server action does not validate. |
| Invited email (email form) | Standard HTML email validation (browser-native `type="email"` + `required`). Server action normalizes the value but does not re-validate format. |
| Selected user | Must be a non-null `searchInvitableUsers` result. The confirmation panel only renders when `selectedUserToAdd` is set. |

---

## 4. Error and Recovery Behavior

| Scenario | User-visible outcome | Panel state |
|----------|---------------------|-------------|
| Delivery failure | Toast: `"Invitation saved but email delivery failed: {errorMessage}"` | Preserved — owner can retry |
| Action failure (throws) | Toast: error `.message` or `"Failed to send invitation."` | Preserved — owner can retry |
| Success (search-select) | No toast; pending list updated; panel cleared | Cleared (input, results, confirmation) |
| Success (email form, in dropdown) | Toast: `"Invitation sent to {email}"` (existing behavior); pending list updated | Form resets |
| Success (email form, collaborators page) | Toast: `"Invitation sent to {email}"` (existing behavior); `router.refresh()` runs | Form resets |

**Recovery note:** In all failure cases the owner sees the error and the panel state is intact, allowing a retry without re-entering the selection.

---

## 5. Roles and Permissions

| Actor | Capability |
|-------|-----------|
| List owner | Can search for invitable users, issue invitations, and view pending invitations inside the dropdown |
| Non-owner authenticated user | Cannot access "Manage Collaborators" — `editableCollaborators` flag is false; dropdown section is not rendered |
| Unauthenticated caller | `inviteCollaborator` server action throws on session check |
| Direct API caller (unauthorized) | `inviteCollaborator` enforces owner permission independently via `assertCanInviteCollaborators`; unauthorized call throws `CollaboratorManagementPermissionDeniedError` |

---

## 6. Integrations and Expected Outcomes

### `inviteCollaboratorWorkflow` (existing service)

- Called by the `inviteCollaborator` server action with `listId`, `inviterId`, `invitedEmail`, `now`.
- Must expose `expiresAt: InvitationExpiry` in its return type (`InviteCollaboratorWorkflowResult`) — threaded through from `issueInvitation`.
- After the call returns, exactly one open invitation row exists in `invitations` for `(listId, invitedEmailNormalized)`.

### `InviteCollaboratorResult` type (new — `lib/types.ts`)

```
InviteCollaboratorResult =
  | { kind: "success"; invitation: SentInvitationSummary }
  | { kind: "failure"; errorMessage: string }
```

The `invitation` in the success variant is constructed inline in the server action from:
- `invitationId` — from workflow result (already `InvitationId`)
- `listId` — from server action input (cast to `ListId`)
- `invitedEmailNormalized` — from server action input: `invitedEmail.trim().toLowerCase() as NormalizedEmailAddress`
- `expiresAt` — from workflow result (already `InvitationExpiry`, via BD2)
- `kind: "sent"` — literal

### `searchInvitableUsers(term, listId)` (new server action)

- Replaces `searchUsers` in `manage-collaborators.tsx`.
- Returns users whose name or email matches `term`, excluding:
  - Existing accepted collaborators on `listId`
  - Users whose normalized email matches an open (`sent` or `pending`) invitation for `listId`
- Both exclusions are applied in a single DB query. The client receives a pre-filtered result.

### `InviteByEmailForm` — `onSuccess` callback

- Receives optional `onSuccess: (invitation: SentInvitationSummary) => void`.
- When provided: calls `onSuccess(invitation)` on `result.kind === "success"`; skips `router.refresh()`.
- When absent (collaborators page): `router.refresh()` still runs.
- Checks `result.kind !== "success"` for the delivery failure toast — does not inspect `emailServiceResponse`.

### `ManageCollaborators` — `invitations` state

- `useState<InvitationSummary[]>(initialInvitations)` — full union type.
- `onSuccess` callback appends an explicitly typed `SentInvitationSummary` (not the union) to this state.
- Both paths (search-select and email form) use the same `setInvitations` append.

---

## 7. Non-Goals and Out-of-Scope Behavior

- Invitation management actions (revoke, resend, copy link) in the search panel — owners use `/lists/collaborators`
- Invitation workflow internals (email templates, token handling, acceptance states, `pending_approval` flow)
- Backfill or migration of existing `UsersTable` emails
- Visual redesign of the search panel or email invite form
- Cleanup of historically directly-added collaborators
- `createSentInvitationSummary` helper — not introduced (YAGNI: one call site)

---

## 8. Acceptance Criteria

### Slice A — Email normalization

- [ ] A newly created user account with email `Alice@Example.com` has `UsersTable.email = "alice@example.com"`
- [ ] A newly created user account with email `" bob@example.com "` (padded) has `UsersTable.email = "bob@example.com"`
- [ ] Existing `UsersTable` rows are unmodified

### Slice B — `searchInvitableUsers`

- [ ] Searching a term that matches an existing collaborator returns no result for that user
- [ ] Searching a term that matches a user with a `sent` invitation for this list returns no result for that user
- [ ] Searching a term that matches a user with a `pending` invitation for this list returns no result for that user
- [ ] Searching a term that matches a user with no connection to the list returns that user in results
- [ ] Empty results produce one generic message — not separate "no users found" vs "all excluded" messages

### Slice C — Invite routing

- [ ] `addCollaborator` does not exist anywhere in the codebase; TypeScript build passes
- [ ] Selecting a user and confirming creates an `invitations` row with `status = "sent"` and sends an email
- [ ] No `list_collaborators` row exists for the invited user after confirmation
- [ ] The confirmation button label is "Invite {name}"
- [ ] The button is disabled while the request is in-flight
- [ ] On delivery failure: toast reads `"Invitation saved but email delivery failed: {msg}"`; panel state is preserved
- [ ] On action failure: toast reads error message or `"Failed to send invitation."`; panel state is preserved
- [ ] No client code inspects `emailServiceResponse` directly; all failure branching uses `result.kind`
- [ ] An unauthorized direct call to `inviteCollaborator` throws `CollaboratorManagementPermissionDeniedError`

### Slice D — Optimistic UI

- [ ] After a successful search-select invite, the pending invitations list shows the new entry without a page reload
- [ ] The new entry is typed as `SentInvitationSummary` (not the union) at the call site
- [ ] After success, the search input clears, results clear, and the confirmation panel closes
- [ ] The dropdown does not close after a successful invite
- [ ] No `router.refresh()` fires after a successful search-select invite inside the dropdown
- [ ] After a successful email form invite inside the dropdown, the pending invitations list shows the new entry without a page reload
- [ ] The email form on `/lists/collaborators` still calls `router.refresh()` after success (no regression)
- [ ] No `useEffect` is added to sync `initialInvitations` prop into local state

---

## Proof Obligation Coverage

| Requirement | Behavior | Acceptance Criteria |
|-------------|----------|---------------------|
| R0 | BR1 | Slice C: no `list_collaborators` insert; invitation record created |
| R1 | BR2 | Slice B: existing collaborator absent from results |
| R2 | BR2 | Slice B: open-invitation user absent from results |
| R3 | BR3 | Slice D: pending list updates without reload |
| R4 | BR4 | Slice C: CTA label is "Invite {name}" |
| R5 | BR5 | Slice C: status is "sent"; no new invitation states |
| R6 | BR6 | Slice A: new user email is lowercase and trimmed |
| A7/BD5–6 | BR7–9 | Slice C: correct toast per failure path; no `emailServiceResponse` in clients |
| OQ1 | BR3, B9 | Slice D: email form `onSuccess` updates pending list |
| A4 | BR10 | Slice C: `addCollaborator` is deleted; build passes |
