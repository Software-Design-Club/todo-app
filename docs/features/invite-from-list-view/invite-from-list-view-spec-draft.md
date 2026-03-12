---
spec: draft
shape: invite-from-list-view-shape.md
breadboard: invite-from-list-view-breadboard.md
frame: invite-from-list-view.md
---

# Invite Collaborators from Individual List View — Draft Functional Spec

**Date:** 2026-03-12
**Status:** Resolved — all open questions answered; ready for slicing

---

## Scope

This spec covers the observable behavior introduced by Shape A. It does not restate the behavior of unchanged affordances (N3, N4, N5, N6, N7, S1, U1, U2, U5, U6, U7).

---

## Behavioral Commitments

### DS-01 — Send email invitation from list view (R0)

When a user with collaborator-management permission submits the invite-by-email form on the individual list page with a valid email address, the system attempts to send an invitation to that email address for that specific list.

**Traceability:** R0, A4, N5→N4, U6

---

### DS-02 — Toast feedback on invite outcome (R1)

After the invite form is submitted:

- If the email service accepted the message (`kind === "accepted"`), the user sees a success toast.
- If the server action returns an error or the email service did not accept the message, the user sees an error toast.

**Traceability:** R1, A4, N7→U7

---

### DS-03 — Invitation list refreshes after submit (R1, R2)

After the invite form is submitted (regardless of email service outcome), the page re-renders server-side. The pending invitations section re-fetches and reflects the current state of open invitations at that moment.

**Decision:** `router.refresh()` triggers a full server re-render, re-running `getInvitations`. No separate client-state update is needed.

**Traceability:** R1, R2, N6→P1 re-render→N2→N1→S2→U3/U4

---

### DS-04 — Open invitations fetched only for permitted users (R2)

When the individual list page renders and the current user has collaborator-management permission (`editableCollaborators === true`), the system fetches open invitations for that list.

"Open" means status is `sent` or `pending_approval`. Invitations with status `pending`, `accepted`, `revoked`, or `expired` are excluded from this result.

When the current user does NOT have collaborator-management permission, `getInvitations` is not called and no invitation data is loaded.

If `getInvitations` throws during server render, the page does not fail. `ManageCollaborators` renders without the Pending Invitations section (graceful fallback). *(Resolved: OQ-3)*

**Traceability:** R2, A1, A2, N1, N2

---

### DS-05 — Pending invitations visible in dropdown (R2)

When the Manage Collaborators dropdown is open and the current user has collaborator-management permission, a "Pending Invitations" section is rendered — but only when at least one open invitation exists.

Each entry in the section shows:

- The invited email address
- A status badge reflecting the invitation's current status (`sent` or `pending_approval`)

When there are no open invitations, the Pending Invitations section is not rendered. *(Resolved: OQ-1)*

**Traceability:** R2, A3, S2→U3→U4

---

### DS-06 — All new dropdown content gated on permission (R0, R2, R3)

The Pending Invitations section, the invite-by-email form, and the "Manage all →" link are rendered only when `editableCollaborators === true`. None of these sections are visible to users without collaborator-management permission. *(Resolved: OQ-2)*

**Traceability:** R0, R2, R3, A2, A3, A4, A5, N2 guard

---

### DS-07 — Dropdown section order (R0, R2, R3)

When the dropdown is open for a user with collaborator-management permission, sections appear in this order:

1. Current Collaborators (existing)
2. Pending Invitations (new — hidden when empty)
3. Invite by Email form (new)
4. "Manage all →" link (new)

*(Resolved: OQ-4)*

**Traceability:** R0, R2, R3, U2, U3, U5/U6, U8

---

### DS-08 — "Manage all →" deep-link (R3)

The dropdown contains a "Manage all →" link visible only to users with `editableCollaborators === true`. Clicking it navigates to `/lists/collaborators#list-{listId}`, where `{listId}` is the ID of the current list.

**Traceability:** R3, A5, U8

---

### DS-09 — List cards on `/lists/collaborators` have anchor IDs (R4)

Each list card rendered on `/lists/collaborators` has an `id` attribute set to `list-{listId}`, where `{listId}` is the list's ID. This allows the browser to scroll to the matching card when navigating to `/lists/collaborators#list-{listId}`.

**Traceability:** R4, A6, U9

---

## Non-Goals (Preserved from Shape)

- Inline Revoke / Resend / Approve / Reject actions in the dropdown
- Unifying the user-search flow with the email invite form
- Changes to invitation backend, email service, or token flow
- Invitation history (accepted / revoked / expired) in the dropdown

---

## Permission Boundaries

| Context | Condition | Behavior |
|---------|-----------|----------|
| `getInvitations` call | `editableCollaborators === false` | Not called — no DB query, no prop passed |
| Pending Invitations section | `editableCollaborators === false` | Not rendered |
| Invite-by-email form | `editableCollaborators === false` | Not rendered |
| "Manage all →" link | `editableCollaborators === false` | Not rendered |

---

## Error Behavior

| Scenario | Behavior |
|----------|----------|
| `getInvitations` throws on page render | Graceful fallback — dropdown renders without Pending Invitations section |
| Email address already has an open invitation for this list | `inviteCollaborator` returns an error; error toast shown (DS-02) |
| Email address belongs to an existing collaborator | `inviteCollaborator` returns an error; error toast shown (DS-02) |

---

## Translation Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| TD-1 | "Open" invitations = `sent` + `pending_approval` only | Shape R2 is explicit; keeps dropdown bounded |
| TD-2 | Permission guard applies to fetch, render of all new sections | Prevents unauthorized data exposure even if component is accidentally rendered |
| TD-3 | `router.refresh()` is sufficient to refresh invitations after submit | Existing behavior in `InviteByEmailForm`; no new client state needed |
| TD-4 | `InviteByEmailForm` composed as-is | Shape A4 says "already complete"; no behavioral change to the form |
| TD-5 | `id` attribute format is `list-{listId}` | Consistent with A6 and the deep-link URL format in A5 |
| TD-6 | Pending Invitations section hidden when empty | User preference (OQ-1); keeps dropdown clean |
| TD-7 | "Manage all →" visible only to `editableCollaborators === true` users | User preference (OQ-2); all new content gated uniformly on same permission |
| TD-8 | Section order: Current Collaborators → Pending Invitations → Invite by Email → Manage all → | User preference (OQ-4) |
| TD-9 | Graceful fallback if `getInvitations` throws | User preference (OQ-3); avoids a broken page for a non-critical secondary feature |

---

## Open Questions

None. All questions resolved.

---

## Traceability Index

| Requirement | Draft Spec Entries |
|-------------|--------------------|
| R0 — send email invite from list view | DS-01, DS-06, DS-07 |
| R1 — toast feedback on invite | DS-02, DS-03 |
| R2 — see open invitations with status | DS-04, DS-05, DS-06, DS-07 |
| R3 — deep-link to that list on collaborators page | DS-06, DS-07, DS-08 |
| R4 — list cards have anchor IDs | DS-09 |

| Breadboard Affordance | Draft Spec Entries |
|-----------------------|--------------------|
| N1 `getInvitations(listId)` | DS-04 |
| N2 conditional fetch in `list.tsx` | DS-04, DS-06 |
| S2 `initialInvitations` prop | DS-04, DS-05 |
| U3 Pending Invitations section | DS-05, DS-06, DS-07 |
| U4 invitation row (email + badge) | DS-05 |
| U8 "Manage all →" link | DS-06, DS-07, DS-08 |
| U9 list card `id` attribute | DS-09 |
