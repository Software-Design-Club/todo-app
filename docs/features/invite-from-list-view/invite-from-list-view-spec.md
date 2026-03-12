---
spec: final
draft: invite-from-list-view-spec-draft.md
slices: invite-from-list-view-slices.md
shape: invite-from-list-view-shape.md
breadboard: invite-from-list-view-breadboard.md
frame: invite-from-list-view.md
---

# Invite Collaborators from Individual List View — Functional Spec

**Date:** 2026-03-12
**Status:** Final — approved for implementation

---

## Decisions Captured from Brainstorming

| # | Decision |
|---|----------|
| B-1 | `sent` invitation status badge label: **"Invited"** |
| B-2 | `pending_approval` invitation status badge label: **"Pending Approval"** |
| B-3 | `pending_approval` row shows originally invited email + badge only — no mismatch email in dropdown |
| B-4 | Pending Invitations section has heading: **"Pending Invitations"** |
| B-5 | Invite by Email form has heading: **"Invite by Email"** |

---

## 1. User Scenarios

### Scenario A — Owner views open invitations for a list

A user with collaborator-management permission opens the Manage Collaborators dropdown on an individual list page. They see a "Pending Invitations" section listing each open invitation with the invited email address and a status badge. If no open invitations exist, the section is absent.

### Scenario B — Owner sends an email invitation

A user with collaborator-management permission opens the Manage Collaborators dropdown, enters an email address in the "Invite by Email" form, and submits. A toast appears confirming whether the invite was sent or failed. The page re-renders; if the invitation is now open, it appears in the Pending Invitations section the next time the dropdown is opened.

### Scenario C — Owner navigates to full management for this list

A user with collaborator-management permission opens the Manage Collaborators dropdown and clicks "Manage all →". The browser navigates to `/lists/collaborators` and scrolls directly to that list's card.

### Scenario D — Non-owner opens the dropdown

A user without collaborator-management permission opens the Manage Collaborators dropdown (if accessible to them). They see no Pending Invitations section, no Invite by Email form, and no "Manage all →" link.

---

## 2. Business Rules

| # | Rule |
|---|------|
| BR-1 | Only invitations with status `sent` or `pending_approval` are shown in the Pending Invitations section. Invitations with status `pending`, `accepted`, `revoked`, or `expired` are excluded. |
| BR-2 | The Pending Invitations section is only shown when at least one open invitation exists for the list. |
| BR-3 | All new dropdown content (Pending Invitations section, Invite by Email form, "Manage all →" link) is only rendered when the current user has collaborator-management permission (`editableCollaborators === true`). |
| BR-4 | Invitation data (`getInvitations`) is only fetched when `editableCollaborators === true`. It is never called for users without that permission. |
| BR-5 | Each list card on `/lists/collaborators` must carry an `id` attribute of the form `list-{listId}` so that fragment navigation resolves correctly. |
| BR-6 | The "Manage all →" link always points to `/lists/collaborators#list-{listId}` where `{listId}` is the ID of the currently viewed list. |
| BR-7 | Dropdown section order (when `editableCollaborators === true`): Current Collaborators → Pending Invitations (if non-empty) → Invite by Email → Manage all →. |

---

## 3. Validation Rules

| # | Rule |
|---|------|
| VR-1 | The Invite by Email form validates that the submitted value is a non-empty email address before calling the server action. (Existing behavior in `InviteByEmailForm` — unchanged.) |

---

## 4. Error and Recovery Behavior

| Scenario | Behavior |
|----------|----------|
| `getInvitations` throws during server render | Page renders normally. `ManageCollaborators` receives an empty invitations array. Pending Invitations section is absent. No error is surfaced to the user. |
| `inviteCollaborator` returns an error (e.g., duplicate invitation, existing collaborator) | Error toast is shown. Page re-renders via `router.refresh()`. No further action required from the user. |
| Email service does not accept the message (`kind !== "accepted"`) | Error toast is shown. Page re-renders via `router.refresh()`. |
| Navigation to `/lists/collaborators#list-{listId}` where list card lacks `id` | Browser lands at top of page (pre-Slice 1 state). After Slice 1, anchor resolves correctly. |

---

## 5. Roles and Permissions

| Role | `editableCollaborators` | Sees Pending Invitations | Sees Invite Form | Sees "Manage all →" | `getInvitations` called |
|------|------------------------|--------------------------|-----------------|----------------------|------------------------|
| Owner | `true` | Yes (if non-empty) | Yes | Yes | Yes |
| Collaborator | `false` | No | No | No | No |
| Any unauthenticated user | N/A | No | No | No | No |

`editableCollaborators` is derived from `isAuthorizedToEditCollaborators(collaborators, user.id)` in `list.tsx` after `getCollaborators` resolves.

---

## 6. Integrations and Expected Outcomes

### `getInvitations(listId)` — new server action

- **Input:** `listId`
- **Output:** Array of `SentInvitationSummary | PendingApprovalInvitationSummary` for the given list where status is `sent` or `pending_approval`
- **Called by:** `list.tsx` server render, conditionally on `editableCollaborators === true`
- **On throw:** Caller catches and passes empty array to `ManageCollaborators`

### `inviteCollaborator` — existing server action (unchanged)

- Called by the existing `InviteByEmailForm` component
- Returns `InviteCollaboratorWorkflowResult`; `kind === "accepted"` on email service acceptance
- No changes to this action

### `router.refresh()` — existing behavior in `InviteByEmailForm` (unchanged)

- Fires after every form submission (success or error)
- Triggers full server re-render of `list.tsx`, re-running `getInvitations`
- Pending Invitations section updates to reflect current state on next dropdown open

### Anchor IDs on `/lists/collaborators`

- `id="list-{listId}"` added to the outer wrapper of each list card
- Enables fragment navigation from "Manage all →" link

---

## 7. Non-Goals and Out-of-Scope Behavior

- Inline Revoke, Resend, Approve, or Reject actions in the dropdown
- Unifying the user-search flow with the email invite form
- Changes to `inviteCollaborator`, the email service, or the invitation token flow
- Invitation history (accepted / revoked / expired) in the dropdown
- Showing the mismatch email on `pending_approval` rows in the dropdown
- Displaying the Pending Invitations section to non-owners

---

## 8. Acceptance Criteria

### Slice 1 — Anchor IDs on Collaborators Page

- [ ] Each list card on `/lists/collaborators` renders with `id="list-{listId}"` where `{listId}` is the list's actual ID
- [ ] Navigating to `/lists/collaborators#list-{listId}` causes the browser to scroll to the matching list card
- [ ] No existing behavior on `/lists/collaborators` is changed

### Slice 2 — Open Invitations Display in Dropdown

- [ ] When `editableCollaborators === true` and open invitations exist, the dropdown shows a "Pending Invitations" heading followed by one row per open invitation
- [ ] Each row shows the originally invited email address and a status badge: **"Invited"** for `sent`, **"Pending Approval"** for `pending_approval`
- [ ] Only invitations with status `sent` or `pending_approval` appear — `pending`, `accepted`, `revoked`, and `expired` do not
- [ ] When no open invitations exist, the "Pending Invitations" section (heading and rows) is not rendered
- [ ] When `editableCollaborators === false`, the Pending Invitations section is not rendered and `getInvitations` is not called
- [ ] If `getInvitations` throws during server render, the page renders normally without the Pending Invitations section

### Slice 3 — Invite by Email Form + "Manage all →" Deep-Link

- [ ] When `editableCollaborators === true`, the dropdown shows an "Invite by Email" heading and the invite form below the Pending Invitations section
- [ ] Submitting a valid email shows a success toast when the email service accepts the message
- [ ] Submitting an email that already has an open invitation shows an error toast
- [ ] After any form submission, the page re-renders and the Pending Invitations section reflects current open invitation state
- [ ] When `editableCollaborators === true`, the dropdown shows a "Manage all →" link at the bottom pointing to `/lists/collaborators#list-{listId}`
- [ ] Clicking "Manage all →" navigates to `/lists/collaborators` and scrolls to that list's card (requires Slice 1)
- [ ] When `editableCollaborators === false`, the Invite by Email form and "Manage all →" link are not rendered
- [ ] Dropdown section order: Current Collaborators → Pending Invitations (if non-empty) → Invite by Email → Manage all →

---

## Slice Coverage

| Slice | Spec entries |
|-------|-------------|
| Slice 1 | BR-5, Scenario C (anchor target), AC Slice 1 |
| Slice 2 | BR-1, BR-2, BR-3, BR-4, B-1, B-2, B-3, B-4, Scenarios A + D, AC Slice 2 |
| Slice 3 | BR-3, BR-6, BR-7, B-5, Scenarios B + C + D, AC Slice 3 |
