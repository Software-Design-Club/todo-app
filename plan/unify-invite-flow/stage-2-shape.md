---
shaping: true
---

# Unify Invite Flow — Shape

**Stage:** 2 — Shaping
**Date:** 2026-03-13
**Status:** Complete (teach-back passed)

---

## Boundaries

- **Appetite:** Small batch (~1 week)
- **Baseline:** `addCollaborator` directly inserts into `list_collaborators` with no email, no invitation record, no acceptance step. The invitee has no say.
- **Problem:** The search-and-add path bypasses the invitation workflow, giving the invitee no notification or opportunity to consent. The email-invite path and the search-and-add path have different consent semantics, which is confusing and incorrect.

## Requirements (R)

| ID | Requirement | Status |
|----|-------------|--------|
| R0 | Selecting a user from search results triggers `inviteCollaboratorWorkflow`, not a direct DB insert | Core goal |
| R1 | Search results exclude users who are already collaborators on this list | Already true |
| R2 | Search results exclude users who have an open (pending/sent) invitation for this list | New |
| R3 | After selection, owner sees a new pending invitation in the open invitations list | New |
| R4 | Search-select CTA label reads "Invite" (not "Add") | New |
| R5 | No new email templates, invitation statuses, or invitation states are introduced | Constraint |
| R6 | User emails are normalized (lowercased, trimmed) at write time in `UsersTable` going forward | New |

## Shapes (S)

### Shape A — Server-side filter with email normalization (selected)

| Part | Mechanism | Flag |
|------|-----------|------|
| A1 | Normalize user email at write time in NextAuth user creation/update path before inserting into `UsersTable` | R6 |
| A2 | `searchInvitableUsers(term, listId)` replaces `searchUsers` — adds subquery to exclude users who are existing collaborators or have an open invitation (direct equality join on normalized email) | R1, R2 |
| A3 | Replace `addCollaborator` call in `manage-collaborators.tsx` with existing `inviteCollaborator` server action | R0 |
| A4 | Delete `addCollaborator` server action (dead code after A3) | — |
| A5 | After mutation success, invalidate both the invitations query and search results | R3 |
| A6 | Rename CTA from "Add" → "Invite" | R4 |
| A7 | Reuse email-form toast logic for delivery failure handling in the search mutation | R5 |
| A8 | Link from search panel to the collaborators page for invitation management (no inline revoke/resend/copy-link) | Out of bounds |

## Fit Check

| Req | Requirement | Status | A |
|-----|-------------|--------|---|
| R0 | Search-select triggers `inviteCollaboratorWorkflow` | Core goal | ✅ |
| R1 | Exclude existing collaborators from results | Already true | ✅ |
| R2 | Exclude open-invitation users from results | New | ✅ |
| R3 | Owner sees pending invite after selection | New | ✅ |
| R4 | CTA reads "Invite" | New | ✅ |
| R5 | No new email templates or states | Constraint | ✅ |
| R6 | Emails normalized at write time | New | ✅ |

## Selected Shape

Shape A — server-side filter with email normalization. Passes all requirements within appetite.

## Risks And Rabbit Holes

| Risk | Why it matters | Patch / Decision |
|------|----------------|------------------|
| Email delivery failure in search path | `inviteCollaboratorWorkflow` can succeed at creating the record but fail to send email — owner sees misleading generic error | Reuse exact toast logic already in `invite-by-email-form.tsx` for the search mutation |
| Race condition: email form + search results | Owner invites via email form, then searches same user before cache invalidates — user appears in results, owner selects them, second invite email sent | Invalidate search results query after any successful invite action (email form or search-select) |
| `addCollaborator` becomes dead code | Future engineers may reach for the old direct-insert path | Delete `addCollaborator` as part of this change |
| Email case mismatch in filter join | `invitedEmailNormalized` is lowercased; `UsersTable.email` may not be | Normalize email at NextAuth write path (R6); join becomes direct equality, no case gymnastics |

## Out Of Bounds

- Invitation management actions (revoke, resend, copy link) in the search panel — owners use the collaborators page for that
- Invitation workflow internals (email templates, token handling, acceptance states, `pending_approval` flow)
- Backfill or migration of existing user emails in `UsersTable`
- Visual redesign of the search panel or invite form
- Cleanup of historically directly-added collaborators (no migration)

## Teach-Back Record

- **Date:** 2026-03-13
- **Result:** Pass (second attempt — items 5 and 6 added after targeted follow-up)
- **Notes:** Human accurately covered problem/baseline, appetite, shape and key parts, and success criteria. Out-of-bounds and success at delivery were confirmed on follow-up. Key clarification added: no invitation management controls in the search panel; link to collaborators page instead.
