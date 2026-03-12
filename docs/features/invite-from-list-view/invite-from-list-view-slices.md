---
slices: true
spec: invite-from-list-view-spec-draft.md
shape: invite-from-list-view-shape.md
breadboard: invite-from-list-view-breadboard.md
---

# Invite Collaborators from Individual List View — Slices

**Date:** 2026-03-12
**Status:** Ready for implementation

---

## Sequence Overview

```
Slice 1 (anchor IDs)  ──────────────────────────────┐
                                                     ↓
Slice 2 (invitation display) ────────────────────→ Slice 3 (form + deep-link)
```

Slice 1 and Slice 2 have no mutual dependency and can be implemented in either order, but both must be complete before Slice 3.

---

## Slice 1 — Anchor IDs on Collaborators Page

**Objective:** Make each list card on `/lists/collaborators` reachable by a URL fragment, so the deep-link introduced in Slice 3 resolves correctly.

**Spec coverage:** DS-09

**Breadboard affordance:** U9

### What changes

- `ListManagementCard` outer `div` (or equivalent wrapper) on `/lists/collaborators` gets `id="list-{listId}"` where `{listId}` is the list's ID.

### Demo scenario

1. Open `/lists/collaborators` in a browser
2. Append `#list-{someListId}` to the URL for a known list
3. Browser scrolls to that list's card

### Acceptance criteria

- [x] Navigating to `/lists/collaborators#list-{listId}` scrolls the browser to the matching list card
- [x] The `id` format is exactly `list-{listId}` (no variation)
- [x] All other list card behavior is unchanged

### Dependencies

None.

### Out of scope

- The "Manage all →" link that points to this anchor (Slice 3)

---

## Slice 2 — Open Invitations Display in Dropdown

**Objective:** When a list owner opens the Manage Collaborators dropdown, they see a Pending Invitations section showing each open invitation's email and status badge. Non-owners see nothing new.

**Spec coverage:** DS-04, DS-05, DS-06

**Breadboard affordances:** N1, N2, S2, U3, U4

### What changes

1. **New server action** `getInvitations(listId)` in `app/lists/_actions/invitations.ts`
   - Queries invitations for the given list where status is `sent` or `pending_approval`
   - Returns an array of `SentInvitationSummary | PendingApprovalInvitationSummary`

2. **`list.tsx` conditional fetch**
   - After resolving `editableCollaborators`, if `true`, calls `getInvitations(listId)`
   - If the call throws, catches the error and passes `initialInvitations = []` (graceful fallback)
   - Passes result as `initialInvitations` prop to `ManageCollaborators`

3. **`ManageCollaborators` component**
   - Accepts new `initialInvitations: (SentInvitationSummary | PendingApprovalInvitationSummary)[]` prop
   - When `initialInvitations` has at least one entry, renders a "Pending Invitations" section
   - Each row shows invited email address + status badge (`sent` → one visual treatment, `pending_approval` → another)
   - When `initialInvitations` is empty, section is not rendered

### Demo scenario

1. As a list owner, navigate to a list that has at least one pending invitation (`sent` or `pending_approval`)
2. Open the Manage Collaborators dropdown
3. See "Pending Invitations" section with each invitation's email and status badge
4. Sign in as a collaborator (non-owner) on the same list — open the dropdown — section does not appear

### Acceptance criteria

- [x] Owner sees Pending Invitations section when open invitations exist
- [x] Each row shows the invited email and a status badge for `sent` or `pending_approval`
- [x] Section is not rendered when there are no open invitations
- [x] Accepted, revoked, expired, and pending invitations are not shown
- [x] Non-owner (`editableCollaborators === false`) sees no Pending Invitations section and `getInvitations` is not called
- [x] If `getInvitations` throws, page renders normally and Pending Invitations section is absent (no crash)

### Dependencies

None (independent of Slice 1).

### Out of scope

- Revoke / Resend / Approve / Reject actions on invitation rows
- The invite-by-email form (Slice 3)
- The "Manage all →" link (Slice 3)

---

## Slice 3 — Invite by Email Form + "Manage all →" Deep-Link

**Objective:** A list owner can send an email invitation directly from the dropdown, see a toast confirming the outcome, and navigate in one click to that list's section on the collaborators page.

**Spec coverage:** DS-01, DS-02, DS-03, DS-06 (form + link gating), DS-07 (section order), DS-08

**Breadboard affordances:** N5→N4 (existing form behavior), N6 (router.refresh), U5, U6, U7, U8

### What changes

1. **`ManageCollaborators` component** — compose `InviteByEmailForm` below the Pending Invitations section (or below Current Collaborators when Pending Invitations is empty), gated on `editableCollaborators === true`

2. **`ManageCollaborators` component** — add "Manage all →" link at the bottom, gated on `editableCollaborators === true`, href = `/lists/collaborators#list-{listId}`

3. **Section order** enforced in `ManageCollaborators`:
   1. Current Collaborators (existing)
   2. Pending Invitations (hidden when empty)
   3. Invite by Email form
   4. "Manage all →" link

4. **`router.refresh()` already in `InviteByEmailForm`** — no change needed; triggers re-render which re-runs `getInvitations`, updating the Pending Invitations section automatically

### Demo scenario

**Invite flow:**
1. As owner, open the Manage Collaborators dropdown
2. Type an email address in the Invite by Email form and submit
3. Success toast appears; dropdown closes; page re-renders; if invitation is now open, it appears in Pending Invitations on next open

**Deep-link flow:**
1. As owner, open the dropdown
2. Click "Manage all →"
3. Browser navigates to `/lists/collaborators` and scrolls directly to that list's card

**Permission boundary:**
1. As non-owner collaborator, open the dropdown
2. Invite form and "Manage all →" link are not visible

### Acceptance criteria

- [x] Owner sees invite-by-email form in the dropdown
- [x] Submitting a valid email triggers `inviteCollaborator` and shows a success toast on acceptance
- [x] Submitting to an email that already has an open invitation shows an error toast
- [x] After submit, `router.refresh()` fires and the Pending Invitations section reflects updated state
- [x] Owner sees "Manage all →" link at the bottom of the dropdown
- [x] Clicking "Manage all →" navigates to `/lists/collaborators#list-{listId}` and scrolls to that list card (requires Slice 1)
- [x] Invite form and "Manage all →" are not rendered for non-owners
- [x] Section order matches: Current Collaborators → Pending Invitations → Invite by Email → Manage all →

### Dependencies

- **Slice 1** must be complete — "Manage all →" link is testable end-to-end only once anchor IDs exist
- **Slice 2** must be complete — post-submit refresh updating the invitations list is only verifiable once the Pending Invitations section exists

### Out of scope

- Changes to `inviteCollaborator` server action or email service
- Unifying user-search and email-invite flows

---

## Slice Sequence Rationale

| Order | Slice | Reason |
|-------|-------|--------|
| 1 | Anchor IDs | Zero-risk single-attribute change; unblocks Slice 3 deep-link verification |
| 2 | Invitation display | Highest-risk work (new server action, prop threading, permission guard, fallback); surface risk early |
| 3 | Form + deep-link | Lowest-risk (composing existing components); depends on both prior slices for full verification |

---

## Coverage Check

| Spec Entry | Slice |
|------------|-------|
| DS-01 Send email invite | Slice 3 |
| DS-02 Toast feedback | Slice 3 |
| DS-03 Invitation list refreshes after submit | Slice 3 |
| DS-04 Open invitations fetch + permission guard + fallback | Slice 2 |
| DS-05 Pending Invitations section with rows | Slice 2 |
| DS-06 All new content gated on permission | Slice 2 (section + fetch), Slice 3 (form + link) |
| DS-07 Section order | Slice 3 |
| DS-08 "Manage all →" deep-link | Slice 3 |
| DS-09 Anchor IDs on collaborators page | Slice 1 |
