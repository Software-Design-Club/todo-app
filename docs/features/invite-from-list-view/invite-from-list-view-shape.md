---
shaping: true
---

# Invite Collaborators from Individual List View — Shape

**Date:** 2026-03-12
**Status:** Shaped — ready for breadboarding

---

## Boundaries

- **Appetite:** ~1 week (small batch)
- **Baseline:** The "Manage Collaborators" dropdown on `/lists/[listId]` shows accepted collaborators and user-search-add/remove only. No email invite, no invitation state visibility, no link to the full management page. The only invitation management exists on `/lists/collaborators`, which is not linked from the individual list view.
- **Problem:** Users with collaborator-management permission can't invite by email or see pending invitation state without leaving the list context entirely.
- **Not this:** Inline Revoke/Resend/Approve/Reject in the dropdown; unifying user-search with email invite flow (separate backlog ticket); backend/email service changes.

---

## Requirements (R)

| ID | Requirement | Status |
|----|-------------|--------|
| R0 | User with collaborator-management permission can send an email invitation from the individual list view | Core goal |
| R1 | User with collaborator-management permission gets feedback (toast) on whether the invite was sent or failed | Core goal |
| R2 | User with collaborator-management permission can see only open invitations (sent / pending_approval) for that list with status badges | Core goal |
| R3 | User with collaborator-management permission can navigate directly to that list's section on `/lists/collaborators` | Core goal |
| R4 | List cards on `/lists/collaborators` have anchor `id`s so deep-links resolve | Enabler for R3 |

---

## Selected Shape: A — Server-loaded, sections in existing dropdown

| Part | Mechanism |
|------|-----------|
| A1 | New `getInvitations(listId)` server action fetches open invitations (`sent` / `pending_approval`) for a single list |
| A2 | `list.tsx` calls `getInvitations` at render alongside existing `getCollaborators` — only when `editableCollaborators === true` |
| A3 | `ManageCollaborators` accepts `initialInvitations` prop; renders a read-only "Pending Invitations" section with status badges |
| A4 | `InviteByEmailForm` (already complete) added as a new section in the dropdown |
| A5 | "Manage all →" link rendered at the bottom of the dropdown pointing to `/lists/collaborators#list-{listId}` |
| A6 | Each list card on `/lists/collaborators` gets `id="list-{listId}"` |

---

## Fit Check

| Req | Requirement | Shape A |
|-----|-------------|---------|
| R0 | User with permission can send email invite from list view | ✅ A4 |
| R1 | Toast feedback on invite sent/failed | ✅ Already in `InviteByEmailForm` |
| R2 | See only open invitations with status in dropdown | ✅ A1 + A3 |
| R3 | Navigate directly to that list on collaborators page | ✅ A5 |
| R4 | List cards have anchor `id`s | ✅ A6 |

---

## Risks And Rabbit Holes

| Risk | Why it matters | Patch / Decision |
|------|----------------|------------------|
| `getInvitations` runs for all visitors | Unnecessary DB call and potential data exposure for non-permitted users | Only call when `editableCollaborators === true` |
| Invitation list grows unbounded | Dropdown becomes unusably long with old history | Show only `sent` and `pending_approval` statuses — captured in R2 |
| `router.refresh()` in `InviteByEmailForm` closes dropdown | Could feel jarring | Correct behavior — dropdown closes, page re-renders with updated invitation list. No action needed. |

---

## Out Of Bounds

- Inline Revoke / Resend / Approve / Reject actions in the dropdown
- Unifying user-search flow with email invite (tracked as separate backlog ticket under Epic 5)
- Changes to invitation backend, email service, or token flow
- Invitation history (accepted / revoked / expired) in the dropdown

---

## Teach-Back Record

- **Date:** 2026-03-12
- **Result:** Pass
- **Notes:** All six items covered accurately. Appetite stated as "not a major feature" — confirmed as ~1 week small batch.
