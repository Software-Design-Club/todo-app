---
date: 2026-02-01T13:52:08-05:00
researcher: Emmanuel
git_commit: d1321303ca824a99482d8ddf0b2ed4981b2f5225
branch: HEAD
repository: todo-app
topic: "Email Invitation System (roadmap item 5)"
tags: [research, codebase, invitations, collaborators, email, auth]
status: complete
last_updated: 2026-02-01
last_updated_by: Emmanuel
last_updated_note: "Added Edge Cases section and expanded Open Questions with product, technical, and UX considerations"
---

# Research: Email Invitation System (roadmap item 5)

**Date**: 2026-02-01T13:52:08-05:00
**Researcher**: Emmanuel
**Git Commit**: d1321303ca824a99482d8ddf0b2ed4981b2f5225
**Branch**: HEAD
**Repository**: todo-app

## Research Question
Research how to do item 5 in `agent-os/product/roadmap.md:26`: Email Invitation System — send email invitations when users are added as collaborators to a list, including a sign-up/sign-in link to access the shared list. Integrate Resend, create templates, and handle invitation token generation/validation.

## Summary
The current codebase already supports adding collaborators by selecting existing users and storing them in `ListCollaboratorsTable`. List access is enforced via permission helpers and the list page gate. There is no implementation for email sending, invitation tokens, or invitation persistence yet; email is documented as Resend in product/tech-stack docs, and invitations are referenced in product docs only. The collaborator add flow is implemented as a server action used by `ManageCollaborators`, and the list page uses `canViewList` to gate private lists.

## Detailed Findings

### Collaborator Add Flow (current entry point for invitations)
- `addCollaborator` server action inserts a collaborator record and revalidates the list path (`app/lists/_actions/collaborators.ts:50-115`).
- `ManageCollaborators` triggers `addCollaborator` from the UI via React Query mutations (`app/lists/_components/manage-collaborators.tsx:53-107`).
- The list header renders the “Manage Collaborators” dropdown only when the user is authorized (`app/lists/_components/list.tsx:99-123`).

### Permissions and Access Control (where invitation acceptance would rely)
- List access is enforced by `canViewList`, which allows public lists to be viewed by anyone and private lists only by collaborators (`app/lists/_actions/permissions.ts:50-69`).
- Private list access in `app/lists/[listId]/page.tsx` redirects unauthenticated users to `/sign-in` and returns 404 for authenticated non-collaborators (`app/lists/[listId]/page.tsx:21-31`).
- Collaborator edit permissions are based on role entries in `ListCollaboratorsTable` (`app/lists/_actions/permissions.ts:21-48`).

### Data Model for Collaborators
- Collaborators are stored in `ListCollaboratorsTable` with `listId`, `userId`, and `role` fields and a unique index on `(listId, userId)` (`drizzle/schema.ts:54-75`).
- Role enum values are `owner` and `collaborator` (`drizzle/schema.ts:49-52`).
- Types wrap these entities as tagged types (`lib/types.ts:13-38`).

### Authentication Flow (link target for sign-in)
- NextAuth GitHub provider stores the user id on the JWT during sign-in and hydrates the session with the database user in the session callback (`auth.ts:15-37`).
- `signIn` ensures the account is created/updated in the database by calling `findOrCreateAccount` (`auth.ts:38-47`).

### Email and Invitations (current state)
- Resend is documented as the email service in the tech stack (`agent-os/product/tech-stack.md:43-45`).
- Invitations are described in the roadmap and mission docs but have no code implementation in the app directory (`agent-os/product/roadmap.md:26`, `agent-os/product/mission.md:47-64`).
- No invitation token tables, routes, or server actions exist in the codebase today (no invitation/token files found during scan).

## Code References
- `app/lists/_actions/collaborators.ts:50-115` — Inserts collaborator records and revalidates list paths.
- `app/lists/_components/manage-collaborators.tsx:53-107` — UI mutation wiring for adding/removing collaborators.
- `app/lists/_actions/permissions.ts:50-69` — List view authorization for public/private and archived lists.
- `app/lists/[listId]/page.tsx:21-31` — Redirect/404 behavior based on authorization.
- `drizzle/schema.ts:49-75` — Collaborator role enum and `ListCollaboratorsTable` schema.
- `auth.ts:15-47` — NextAuth callbacks and account creation on sign-in.
- `agent-os/product/roadmap.md:26` — Roadmap description for email invitation system.
- `agent-os/product/tech-stack.md:43-45` — Resend listed as email service.

## Architecture Documentation
- Collaboration is built around `ListCollaboratorsTable` and permission helpers that validate whether a user can view or manage a list.
- List pages are gated in the page route (`/lists/[listId]`), which uses `canViewList` for access control and redirects unauthenticated users to `/sign-in` for private lists.
- Collaborator management is centralized in server actions and a single client component (`ManageCollaborators`) that performs searches and mutations.
- Archived lists are owner-only (collaborators cannot view them), so invite acceptance must account for archived state.
- List deletion is permanent and cascades collaborator records; any invitation persistence should consider cascade behavior to avoid orphaned invites.

## Historical Context (from thoughts/)
- `thoughts/shared/research/2025-12-21-public-list-link-sharing.md` — Notes public list access, permission gating, and share link UI for public lists.
- `thoughts/shared/plans/2025-12-28-public-list-link-sharing.md` — Implementation plan for share link UI, including current permission logic references.

## Related Research
- `thoughts/shared/research/2025-12-21-public-list-link-sharing.md`

## Edge Cases Not Yet Documented

### Invitation Lifecycle
- **Duplicate invitations**: What if the same email is invited multiple times to the same list? Should we prevent duplicates or allow resending?
- **List state changes**: What if the list is archived/deleted after invitation sent but before acceptance? Should pending invitations be auto-revoked?
- **Inviter permission changes**: What if the inviter loses owner status after sending the invitation? Should pending invitations be voided?
- **Invitation expiration**: Should invitations expire? If so, after how long (7 days, 30 days, never)?
- **Invitation revocation**: Can invitations be revoked/canceled by the owner before acceptance? What UI/permissions needed?
- **Archived list access**: Archived lists are owner-only even for collaborators — should invitation acceptance be blocked or show a clear “list archived” message?
- **Deleted list access**: List deletion is permanent and cascades collaborator records — what happens if a pending invitation points to a deleted list?
- **Public list invites**: If a list is public (viewable by anyone), do invites still matter (e.g., for edit access), or should they be discouraged/blocked?

### User State Handling
- **Existing vs new users**: Should we send email invitations to existing users (who already have accounts) or only to new users who need to sign up?
- **Already a collaborator**: What if the user is already a collaborator when the invitation arrives? Should we show "already a member" message?
- **Email mismatch**: What if the user signs up with a different email than the one invited? How do we match them to the invitation?
- **Wrong recipient**: What happens if the invitation link is clicked by someone other than the intended recipient?
- **User status**: Users have a `status` enum (`active`/`deleted`) but no enforcement — should deleted users be re-invitable or blocked?
- **No-email accounts**: GitHub sign-in rejects users without email — how should invites behave if a user’s provider hides email?

### Technical Edge Cases
- **Email delivery failures**: How to handle bounces, invalid addresses, or delivery failures from Resend?
- **Rate limiting**: Should we implement rate limiting on invitation sending to prevent spam/abuse?
- **Token security**: One-time use vs reusable tokens? How to handle expiration and revocation securely?
- **From address**: What "from" email address should be used for Resend emails? Is it configured?

## Open Questions

### Data & Persistence
- Where the invitation tokens should be persisted (no existing schema/table found).
- Should invitations be stored in a **separate table** (invitations table with token, email, listId, expiresAt) or should we modify the existing collaborator flow?

### Integration & Infrastructure
- Where invitation emails would be triggered in the collaborator add flow (no existing email utilities found).
- Are there existing Resend API credentials/environment variables set up?
- Should we implement email preference settings (can users opt out of invitation emails)?
- Do we need to handle email unsubscribes/bounces with Resend webhooks?

### Product & UX
- What's the desired UX for invitation acceptance:
  - Auto-accept when clicking link and already signed in?
  - Explicit "Accept Invitation" button/page?
  - Redirect to list immediately after sign-in/sign-up?
- Should there be an **invitation management UI** where owners can see pending invites, resend, or cancel them?
- How should the invitation link work for the **sign-up/sign-in flow**:
  - Include list ID in the token payload?
  - Store pending invitation in session/cookie?
  - Redirect to `/sign-in?invitation=TOKEN` then process after auth?

### Technical Architecture
- What email template format should be used:
  - React Email (component-based)?
  - Plain HTML templates?
  - Existing template system in the codebase?
- Should we track invitation analytics (sent, opened, clicked, accepted)?
- How to handle the **existing user flow** vs **new user flow**:
  - Existing users: auto-add to list and notify via email?
  - New users: send invitation with sign-up link?
