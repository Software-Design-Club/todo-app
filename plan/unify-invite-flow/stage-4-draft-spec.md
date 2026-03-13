---
draft-spec: true
---

# Unify Invite Flow — Draft Functional Spec

**Stage:** 4 — Translate Shape to Spec
**Date:** 2026-03-13
**Status:** Draft (not finalized — pending Stage 6 brainstorming review)

---

## Source Traceability

| Artifact | Path |
|----------|------|
| Frame | `plan/unify-invite-flow/stage-1-frame.md` |
| Shape | `plan/unify-invite-flow/stage-2-shape.md` |
| Breadboard | `plan/unify-invite-flow/stage-3-breadboard.md` |

---

## Behavioral Commitments

### B1 — Search-select triggers invitation workflow (R0)

When a list owner selects a user from search results and confirms the invite, the system creates an invitation record for that user's normalized email and sends an invitation email via the existing `inviteCollaboratorWorkflow`.

The system does **not** insert a row into `list_collaborators` at selection time. The selected user is not immediately accessible as a collaborator on the list.

**Traceability:** R0, A3, A4.

---

### B2 — Search results exclude existing collaborators and open-invitation users (R1, R2)

Search results returned by `searchInvitableUsers(term, listId)` exclude:
- Users who are already accepted collaborators on the list
- Users whose normalized email matches an open (`sent` or `pending`) invitation for the list

Both exclusions are enforced server-side. The client receives a pre-filtered list and performs no additional filtering.

**Empty results message:** Because both exclusions are applied server-side, the client cannot distinguish between "no matching users in the database" and "all matching users already have access." The empty-results message is a single generic string.

**Traceability:** R1, R2, A2.

**Translation decision:** The current `searchUsers` + client-side filter pattern exposes two separate empty-state messages ("No users found" vs "All found users are already collaborators"). Moving both filters server-side collapses these into one message. This is an intentional narrowing — owner does not need to know which exclusion applied.

---

### B3 — Pending invitations list updates immediately on success (R3)

After a successful search-select invite, the pending invitations section inside the "Manage Collaborators" dropdown shows a new entry for the invited user's email without a page reload and without closing the dropdown.

The new entry is constructed client-side from the server action response and the selected user's email, and is explicitly typed as `SentInvitationSummary` (from `lib/types.ts`). It is appended to the local `InvitationSummary[]` state.

The search panel resets on success: the search input clears, the results list clears, and the confirmation panel closes.

**Traceability:** R3, A5, Breadboard decisions.

---

### B4 — Confirmation button reads "Invite {name}" (R4)

The confirmation button in the search panel reads "Invite {name}" where `{name}` is the selected user's display name. The button is disabled while the invitation request is in flight, and reads a loading label during that time.

**Traceability:** R4, A6.

---

### B5 — Invitation uses existing email template and status values (R5)

The invitation email sent via the search-select path uses the same template as the email-form path. No new invitation status values (`sent`, `pending`, `accepted`, `pending_approval`, `revoked`, `expired`) are introduced.

**Traceability:** R5.

---

### B6 — User email normalized at account creation (R6)

When a new user account is created via `findOrCreateAccount`, the email value written to `UsersTable` is trimmed (leading/trailing whitespace removed) and lowercased before the `INSERT`.

This ensures that `UsersTable.email` and `invitations.invitedEmailNormalized` can be compared with a direct equality join without case gymnastics.

**Traceability:** R6, A1.

**Scope note:** This normalization applies to new accounts created going forward. Existing user emails in `UsersTable` are not backfilled (explicitly out of scope per the shape).

---

### B7 — Error feedback matches email-form toast pattern (A7)

**Delivery failure** (invitation record created, but email provider did not accept delivery): the search panel shows a toast error: `"Invitation saved but email delivery failed: {errorMessage}"`.

**Action failure** (server action throws — e.g., permission denied, network error): the search panel shows a toast error with the error's message if available, otherwise `"Failed to send invitation."`.

In both failure cases, the search panel state is **not** reset — the owner can see the error and retry.

**Traceability:** A7, Breadboard N2.

---

### B8 — Permission boundary enforced server-side

The "Manage Collaborators" dropdown is only rendered for list owners (`editableCollaborators` flag). The `inviteCollaborator` server action enforces owner permission independently; an unauthorized direct call throws `CollaboratorManagementPermissionDeniedError`.

**Traceability:** Breadboard P1, existing permission model.

---

### B9 — Email form updates pending invitations list on success

`InviteByEmailForm` receives an `onSuccess` callback prop of type `(invitation: SentInvitationSummary) => void`. When the email form successfully issues an invitation, it calls this callback with a `SentInvitationSummary` constructed from the server action response.

`ManageCollaborators` wires this callback to `setInvitations`, so the pending invitations list updates immediately after an email-form invite — consistent with the search-select path.

When `onSuccess` is provided, `InviteByEmailForm` skips `router.refresh()` (guarded by `if (!onSuccess)`). When `onSuccess` is absent (e.g. the collaborators page), `router.refresh()` runs as before.

**Traceability:** OQ1 resolution, B3 consistency.

---

### B10 — `addCollaborator` server action deleted

The `addCollaborator` server action is deleted. No code path performs a direct insert into `list_collaborators` for new collaborators added via the search panel.

**Traceability:** A4.

---

## Non-Goals (Preserved from Shape)

- Invitation management actions (revoke, resend, copy link) in the search panel — owners use `/lists/collaborators`
- Invitation workflow internals (email templates, token handling, acceptance states, `pending_approval` flow)
- Backfill or migration of existing `UsersTable` emails
- Visual redesign of the search panel or email invite form
- Cleanup of historically directly-added collaborators

---

## Translation Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| TD1 | Empty search results show a single generic message, not separate "no users found" vs "all have access" messages | Both exclusions move server-side; the client cannot distinguish which filter removed a result |
| TD2 | `router.refresh()` is skipped when `InviteByEmailForm` receives an `onSuccess` callback; it still runs when no callback is provided (collaborators page) | Avoids unnecessary server round-trip inside the dropdown; `useState` is source of truth within session. Guard is `if (!onSuccess)` in the `finally` block. |
| TD3 | `onSuccess` constructs an explicit `SentInvitationSummary` typed from `lib/types.ts` | Makes the coupling between the UI optimistic update and the shared type contract visible at the call site |
| TD4 | Email normalization scoped to account creation only (`findOrCreateAccount`) | Normalization at write time is sufficient for the equality join; updating existing rows is out of scope |

---

## Open Questions

| # | Question | Blocking? | Notes |
|---|----------|-----------|-------|
| OQ1 | ~~After lifting invitations to `useState`, does the email form regression need fixing?~~ | Resolved | Decision: `InviteByEmailForm` receives `onSuccess` callback prop → B9. |

---

## Proof Obligation Coverage

| Requirement | Behavioral Commitment | Proof Signal |
|-------------|----------------------|--------------|
| R0 | B1 | No `list_collaborators` row at selection time; invitation record and email exist |
| R1 | B2 | Existing collaborator does not appear in search results |
| R2 | B2 | User with open invitation does not appear in search results |
| R3 | B3 | Pending invitations list shows new entry without page reload |
| R4 | B4 | Confirmation button label is "Invite {name}" |
| R5 | B5 | Invitation row status is "sent"; no new status values in schema |
| R6 | B6 | Newly created user email in `UsersTable` is lowercase and trimmed |
| A7 | B7 | Correct toast shown for delivery failure vs action failure |
| OQ1 | B9 | Email form `onSuccess` callback updates pending invitations list |
| A4 | B10 | `addCollaborator` is not importable; TypeScript build passes |
