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

## Edge Cases

### Invitation Lifecycle
- **Duplicate invitations**: Prevent duplicates; if a pending invite exists, refresh token/expiry and resend.
- **List state changes**: Auto-revoke pending invites if the list is archived or deleted; invite link should show a clear “invite no longer valid” UI state.
- **Inviter permission changes**: N/A for now — there is no flow for an owner/creator to lose status. Revisit if role transfer/removal is added.
- **Invitation expiration**: Yes, default 7 days. Must be communicated in both the sender UI and the email content.
- **Invitation revocation**: Yes; owners can revoke/cancel pending invites on the Manage Collaborators page (not the dropdown).
- **Archived list access**: Archive revokes any pending invites. Invite link should show a revoked/invalid UI state (possibly 404).
- **Deleted list access**: List deletion cascades collaborator/invite rows; invite links should resolve to invalid/404 since the record no longer exists.
- **Public list invites**: Allow invites for edit access; public only affects view permissions.

### User State Handling
- **Existing vs new users**: Always send an email notification when a user is added; leave room for in-app notifications later.
- **Already a collaborator**: Prevent sending invites to users who are already collaborators; invite flow should validate this upfront.
- **Email mismatch**: Enforce strict email match; otherwise route to owner confirmation.
- **Wrong recipient**: Enforce strict email match; otherwise route to owner confirmation flow (per email mismatch policy).
- **User status**: Block invites to deleted users.
- **No-email accounts**: Require a manual email capture step before acceptance, then apply the strict email match + owner confirmation policy if it still mismatches.

### Technical Edge Cases
- **Email delivery failures**: Minimal webhook handling now (bounces/failures only), structured to allow full delivery tracking later.
- **Rate limiting**: No for MVP; add later if abuse emerges.
- **Token security**: One-time use; resend issues a new token and invalidates the old.
- **From address**: Configure via environment variable.

## Decisions (Resolved)

### Data & Persistence
- Decision: persist invitation tokens by **extending `ListCollaboratorsTable`** (no separate invitations/tokens table).
- Rationale:
  - Auth is handled by OAuth providers (GitHub/Google), so a generic tokens table is not needed for the current roadmap scope.
  - A separate invitations table would add extra query/join complexity to present collaborators and invites in different states in one UI.

### Integration & Infrastructure
- Decision: trigger invitation emails from a **dedicated invite action** called by the UI (separate from the existing search/add flow).
- UX direction: update Manage Collaborators to make it explicit that users can either:
  - search existing users to add, or
  - invite new users by email (separate input/section).
- Add a “Copy invite link” fallback for manual sharing if email delivery fails or is skipped.
- Decision: assume Resend env vars are **not set up**; add `.env` entries and an ops checklist during implementation.
- Decision: no email preference settings for MVP; invitation emails always send.
- Decision: minimal webhook handling now (bounces/failures only), structured to allow full delivery tracking later.

### Product & UX
- Decision: auto-accept on link click if already signed in; otherwise auto-accept after sign-in and redirect to the list.
- Acceptance rules: if invite is expired, already accepted, or revoked, show a clear state message instead of accepting.
- Email mismatch policy: **strict match** (invite email must match session email). If mismatch, fall back to **owner confirmation** (requires a new owner approval UI/flow definition).
- Decision: add a **Pending Invites** section in Manage Collaborators with resend/cancel/copy link actions, and include an **Owner Approval** area for invite acceptances with email mismatches. This requires a **new Manage Collaborators page** to supplement the dropdown in `app/lists/_components/list.tsx`.
- Decision: use a dedicated `/invite?token=TOKEN` route that handles auth + acceptance.

### Technical Architecture
- Decision: use **React Email** for templates.
- Decision: track only what is stored on `ListCollaboratorsTable` for now (invite status/timestamps).
- Decision: always send an email notification when a user is added; leave room for an in-app notification channel later.
