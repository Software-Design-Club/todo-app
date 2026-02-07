# Email Invitation System Implementation Plan

## Overview
Implement roadmap item 5 from `agent-os/product/roadmap.md:26` by adding email-based collaborator invitations with secure one-time tokens, sign-in continuation, and owner management controls.

This rewrite replaces the prior plan with a tighter execution path based on the current codebase and existing constraints.

## Current State Analysis

### What Exists Today
- Collaborators are added only by selecting existing users and inserting directly into `list_collaborators` via `addCollaborator` (`app/lists/_actions/collaborators.ts:50`).
- Collaborators are loaded via `getCollaborators`, which uses an inner join to `todo_users` and therefore only returns rows with a concrete `userId` (`app/lists/_actions/collaborators.ts:118`, `app/lists/_actions/collaborators.ts:133`).
- Collaborator management UI is a dropdown panel scoped to a single list (`app/lists/_components/list.tsx:104`, `app/lists/_components/manage-collaborators.tsx:1`).
- Private list access is enforced by collaborator membership checks (`app/lists/_actions/permissions.ts:56`, `app/lists/[listId]/page.tsx:27`).
- Sign-in always redirects to `/` and cannot preserve invite continuation (`app/sign-in/_components/sign-in.tsx:23`).
- List lifecycle operations exist (archive/delete) but have no invitation lifecycle hook (`app/lists/_actions/list.ts:326`, `app/lists/_actions/list.ts:399`).
- `resend` is installed but there is no email-delivery code path in `app/` or `lib/` (`package.json:35`).

### Gaps Blocking Invitations
- No invitation token generation, persistence, or acceptance route exists.
- `list_collaborators.userId` is non-nullable, which cannot represent email-only pending invites (`drizzle/schema.ts:60`).
- Current collaborator queries and tagged types assume all records are accepted user memberships (`lib/types.ts:30`, `app/lists/_actions/collaborators.ts:118`).
- `createList` currently does not guarantee owner collaborator row creation; owner rows are only backfilled by script (`app/lists/_actions/list.ts:165`, `drizzle/backfillListCollaborators.ts:27`).

## Desired End State
1. Owners can invite by email from the list dropdown and a dedicated cross-list management page.
2. Invitation email contains a one-time `/invite?token=...` link with expiry.
3. Logged-out recipients are redirected to sign-in and resumed back to invite acceptance.
4. Matching email accepts invite and grants collaborator access.
5. Mismatched email enters `pending_owner_approval` and owners can approve/reject.
6. Owners can resend, revoke, and copy invite links.
7. Archive/delete invalidates open invites automatically.

### End-State Verification
- `npm run typecheck` passes.
- `npm run lint` passes.
- New invitation-focused automated tests pass.
- Migration applies cleanly and backfill assertions pass.
- Manual checks confirm real email delivery and OAuth invite continuation.

### Locked Decisions (No Open Questions)
- Persist invitation lifecycle by extending `list_collaborators` (no new invitations table).
- Keep strict email-match on acceptance; mismatch requires owner approval.
- Keep existing dropdown workflow and add a dedicated collaborator management page.
- Keep GitHub auth provider for MVP.

## What We're NOT Doing
- Adding new auth providers.
- Building a full notification center.
- Adding global anti-abuse/rate-limiting infrastructure beyond basic validation.
- Building advanced email analytics dashboards.

## Implementation Approach
Use incremental vertical slices:
1. Stabilize collaborator invariants and environment safety.
2. Evolve schema and data model safely.
3. Add invitation domain services and email dispatch.
4. Add invite acceptance + auth continuation.
5. Expand owner UX for invitation operations.
6. Tie invite lifecycle into archive/delete and release checks.

---

## Phase 1: Foundation and Invariants

### Overview
Prepare the app so invitation features can rely on stable collaborator ownership and explicit environment validation.

### Changes Required

#### 1. Owner collaborator invariant on list creation
**Files**:
- `app/lists/_actions/list.ts`
- `app/sign-in/_components/_actions/find-or-create-account.ts`
- `drizzle/backfillListCollaborators.ts`

**Changes**:
- Ensure list creation always creates/upserts an owner row in `list_collaborators`.
- Reuse one helper for owner-upsert logic from both list creation paths.
- Keep backfill script for historical rows and make it idempotent.

#### 2. Environment guardrails
**Files**:
- `.env.example`
- `scripts/verify-env.mjs` (new)
- `package.json`

**Changes**:
- Add required invitation/email env vars (`RESEND_API_KEY`, `EMAIL_FROM`, `APP_BASE_URL`, optional webhook secret).
- Add `npm run verify:env` script used before invite email dispatch.

### Success Criteria

#### Automated Verification
- [ ] Owner row is created/upserted when creating new lists (test or assertion run).
- [ ] `npm run verify:env` fails when required keys are missing.
- [ ] `npm run verify:env` passes when keys are present.
- [ ] `npm run typecheck` passes.

#### Manual Verification
- [ ] Required invitation/env values are configured in local and deployment environments.

**Implementation Note**: Pause after this phase for human confirmation that environment setup is complete.

---

## Phase 2: Schema Evolution for Invitation Lifecycle

### Overview
Extend `list_collaborators` to represent both accepted collaborators and pending invitations.

### Changes Required

#### 1. Add invitation fields and statuses
**Files**:
- `drizzle/schema.ts`
- `drizzle/*.sql` (new migration)
- `drizzle/meta/*` (generated)

**Changes**:
- Add invitation status enum: `sent`, `accepted`, `pending_owner_approval`, `revoked`, `expired`.
- Make `userId` nullable for email-only pending invites.
- Add invite metadata columns: normalized email, token hash, expiry, inviter ID, sent/accepted/revoked timestamps, approval metadata.
- Add partial unique indexes:
  - one accepted membership per `listId + userId`
  - one open invite per `listId + invitedEmailNormalized` for open states.

#### 2. Backfill and query compatibility
**Files**:
- `drizzle/backfillListCollaborators.ts`
- `app/lists/_actions/collaborators.ts`
- `lib/types.ts`

**Changes**:
- Backfill legacy collaborator rows to `inviteStatus='accepted'`.
- Keep collaborator read-paths filtering for accepted rows so existing list rendering remains stable.
- Add invitation-focused types instead of overloading `ListUser`.

### Success Criteria

#### Automated Verification
- [ ] Migration applies cleanly on a fresh DB.
- [ ] Migration applies cleanly on existing DB state.
- [ ] Backfill results in zero legacy rows with invalid invite status.
- [ ] Existing collaborator list screens still render accepted users only.
- [ ] `npm run typecheck` and `npm run lint` pass.

#### Manual Verification
- [ ] Spot-check one migrated list in DB to confirm accepted collaborator rows remain intact.

**Implementation Note**: Pause after this phase for manual DB validation before service-layer work.

---

## Phase 3: Invitation Domain Services and Email Dispatch

### Overview
Add server-side invitation lifecycle operations and transactional email integration.

### Changes Required

#### 1. Invitation domain module and server actions
**Files**:
- `lib/invitations/token.ts` (new)
- `lib/invitations/service.ts` (new)
- `app/lists/_actions/invitations.ts` (new)
- `app/lists/_actions/permissions.ts`

**Changes**:
- Implement secure token creation/hash/validation and one-time consumption.
- Implement invitation operations:
  - create invite
  - resend (rotate token)
  - revoke
  - owner approve/reject mismatch
  - fetch invites by status/list
- Enforce owner-only invite management using existing permission model (`app/lists/_actions/permissions.ts:27`).

#### 2. Email sender integration
**Files**:
- `lib/email/resend.ts` (new)
- `app/emails/invitation-email.tsx` (new)

**Changes**:
- Implement Resend wrapper with strict env checks.
- Send invitation email with canonical acceptance URL built from `APP_BASE_URL`.
- Persist delivery attempt metadata for operational debugging.

#### 3. Automated tests for domain logic
**Files**:
- `tests/unit/invitations/*.test.ts` (new)
- `vitest.config.ts` (new)
- `package.json`

**Changes**:
- Add invitation-focused unit tests for token hashing, expiry, duplicate open invite handling, and state transitions.
- Add `npm run test:unit`.

### Success Criteria

#### Automated Verification
- [ ] `npm run test:unit` passes invitation domain tests.
- [ ] Duplicate open invite reuses row and rotates token.
- [ ] Revoke/approve/reject transitions are enforced by role and current status.
- [ ] `npm run typecheck` and `npm run lint` pass.

#### Manual Verification
- [ ] None required in this phase.

**Implementation Note**: Pause after this phase for review of invitation state machine behavior.

---

## Phase 4: Invite Acceptance Route and Auth Continuation

### Overview
Implement invite-link handling with deterministic outcomes across auth states.

### Changes Required

#### 1. Add invite route
**Files**:
- `app/invite/page.tsx` (new)
- `app/lists/_actions/invitations.ts`

**Changes**:
- Parse token from query string.
- Validate token, status, and expiry.
- If unauthenticated, redirect to sign-in with encoded `redirectTo=/invite?token=...`.
- If authenticated:
  - accept on strict email match
  - move to `pending_owner_approval` on mismatch
  - render explicit UI states for invalid/expired/revoked/already-accepted/pending-owner-approval.

#### 2. Make sign-in redirect-aware
**Files**:
- `app/sign-in/page.tsx`
- `app/sign-in/_components/sign-in.tsx`

**Changes**:
- Read `redirectTo` from `searchParams` on sign-in page.
- Pass dynamic redirect target to `signIn` instead of always `/` (`app/sign-in/_components/sign-in.tsx:23`).

### Success Criteria

#### Automated Verification
- [ ] Unit/integration coverage for token validation and state rendering decisions.
- [ ] Unauthenticated invite route redirects to sign-in with preserved return URL.
- [ ] Authenticated matching-email flow creates accepted collaborator membership.
- [ ] `npm run typecheck` and `npm run lint` pass.

#### Manual Verification
- [ ] End-to-end OAuth roundtrip from invite link returns user to invite acceptance.
- [ ] Mismatched-email account lands in pending-owner-approval state.

**Implementation Note**: Pause after this phase for human validation of the live auth redirect flow.

---

## Phase 5: Owner Invitation Management UX

### Overview
Expose invitation workflows in both existing list-level controls and a dedicated cross-list page.

### Changes Required

#### 1. Extend list dropdown manager
**Files**:
- `app/lists/_components/manage-collaborators.tsx`
- `app/lists/_components/list.tsx`

**Changes**:
- Keep existing "add existing user" flow (`app/lists/_components/manage-collaborators.tsx:121`).
- Add invite-by-email input/actions in same component.
- Add status sections for pending invites and mismatch approvals.
- Add actions: resend, revoke, copy invite link.

#### 2. Add dedicated collaborator management page
**Files**:
- `app/lists/collaborators/page.tsx` (new)
- `app/lists/_components/user-lists.tsx`
- `app/lists/page.tsx`

**Changes**:
- Build cross-list owner view with grouped invites and approvals.
- Allow list selection for invite creation from one central page.
- Link to this page from existing lists UI.

### Success Criteria

#### Automated Verification
- [ ] Owner-only access enforced for invite operations.
- [ ] Collaborator/non-owner attempts fail with clear server errors.
- [ ] Pending invites and accepted collaborators are both rendered correctly.
- [ ] `npm run typecheck`, `npm run lint`, and relevant tests pass.

#### Manual Verification
- [ ] From a list dropdown, owner can send/resend/revoke/copy invite.
- [ ] Dedicated page shows invites across owned lists and allows approval decisions.

**Implementation Note**: Pause after this phase for UX sign-off before lifecycle/webhook wiring.

---

## Phase 6: Lifecycle Hooks, Webhook, and Release Hardening

### Overview
Make invitation state resilient to list lifecycle events and finalize release readiness.

### Changes Required

#### 1. Archive/delete lifecycle integration
**Files**:
- `app/lists/_actions/list.ts`
- `lib/invitations/service.ts`

**Changes**:
- On archive (`app/lists/_actions/list.ts:326`), revoke all open invites for that list.
- On delete (`app/lists/_actions/list.ts:399`), invalidate open invite tokens and mark records terminal before cascade deletion.

#### 2. Resend webhook endpoint (minimal)
**Files**:
- `app/api/webhooks/resend/route.ts` (new)
- `lib/email/resend.ts`

**Changes**:
- Verify webhook signature.
- Persist bounce/failure metadata onto invitation records.

#### 3. Final verification command and runbook
**Files**:
- `package.json`
- `README.md` or `plan/` runbook doc

**Changes**:
- Add one release verification command that chains env/type/lint/tests.
- Document env requirements, migration order, and failure troubleshooting.

### Success Criteria

#### Automated Verification
- [ ] Archive/delete tests confirm open invites are invalidated.
- [ ] Webhook tests confirm failure metadata persistence.
- [ ] Release verification command passes in CI/local.

#### Manual Verification
- [ ] Send one real invitation email in deployed environment.
- [ ] Trigger one webhook test event and confirm persisted update.

**Implementation Note**: Pause after this phase for production-readiness approval.

---

## Testing Strategy

### Unit Tests
- Token generation, hashing, and one-time consumption.
- Invitation status transitions and permission checks.
- Redirect encoding/decoding logic for invite continuation.

### Integration Tests
- Invite creation/resend/revoke against DB constraints.
- Acceptance flow (match vs mismatch) state transitions.
- Archive/delete effects on open invites.
- Webhook failure persistence.

### Manual Testing Steps
1. Owner sends invite from list dropdown.
2. Invitee opens link while logged out and is redirected to sign-in.
3. After OAuth sign-in, invite is accepted and list access is granted.
4. Repeat with mismatched email and confirm pending-owner-approval.
5. Owner resolves pending approval and verify final access outcome.
6. Archive list and confirm outstanding invite link is invalid.

## Performance Considerations
- Add indexes for `inviteTokenHash`, `invitedEmailNormalized`, and partial open-invite uniqueness.
- Keep collaborator rendering queries filtered to accepted rows to avoid bloating list-page payloads.
- Avoid synchronous retries in request path when email provider fails.

## Migration Notes
- Run schema migration before shipping invite UI/actions.
- Run collaborator backfill immediately after migration.
- Keep migration and backfill idempotent for repeated deploy safety.
- Rollback plan: disable invite UI/actions via feature flag/env gate if email or migration issues occur.

## References
- Roadmap item: `agent-os/product/roadmap.md:26`
- Existing collaborator actions: `app/lists/_actions/collaborators.ts:50`
- Permission model: `app/lists/_actions/permissions.ts:27`
- List page access gate: `app/lists/[listId]/page.tsx:27`
- Sign-in redirect behavior: `app/sign-in/_components/sign-in.tsx:23`
- Schema baseline: `drizzle/schema.ts:54`
- Owner backfill utility: `drizzle/backfillListCollaborators.ts:27`
