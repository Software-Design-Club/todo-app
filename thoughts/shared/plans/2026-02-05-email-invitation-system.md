# Email Invitation System Implementation Plan

## Overview
Implement roadmap item 5 from `agent-os/product/roadmap.md:26` by adding email-based collaborator invitations with secure one-time tokens, sign-in continuation, and owner management controls.

This revision is automation-first: after initial environment setup, phase completion should be validated by automated checks (unit, integration, e2e) whenever technically possible.

## Current State Analysis

### What Exists Today
- Collaborators are added only by selecting existing users and inserting directly into `list_collaborators` via `addCollaborator` (`app/lists/_actions/collaborators.ts:50`).
- Collaborators are loaded via `getCollaborators`, which uses an inner join to `todo_users` and therefore only returns rows with a concrete `userId` (`app/lists/_actions/collaborators.ts:118`, `app/lists/_actions/collaborators.ts:133`).
- Collaborator management UI is a dropdown panel scoped to a single list (`app/lists/_components/list.tsx:104`, `app/lists/_components/manage-collaborators.tsx:1`).
- Private list access is enforced by collaborator membership checks (`app/lists/_actions/permissions.ts:56`, `app/lists/[listId]/page.tsx:27`).
- Sign-in always redirects to `/` and cannot preserve invite continuation (`app/sign-in/_components/sign-in.tsx:23`).
- List lifecycle operations exist (archive/delete) but have no invitation lifecycle hook (`app/lists/_actions/list.ts:326`, `app/lists/_actions/list.ts:399`).
- `resend` is installed but there is no email-delivery code path in `app/` or `lib/` (`package.json:35`).
- The codebase currently has no unit/integration/e2e test harness configured (`package.json:6`).

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

### End-State Verification (Automation-First)
- `npm run verify:env` passes.
- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm run test:unit` passes.
- `npm run test:integration` passes.
- `npm run test:e2e:smoke` passes.
- `npm run verify:all` passes as the release gate.

### Locked Decisions (No Open Questions)
- Persist invitation lifecycle by extending `list_collaborators` (no new invitations table).
- Keep strict email-match on acceptance; mismatch requires owner approval.
- Keep existing dropdown workflow and add a dedicated collaborator management page.
- Keep GitHub auth provider for MVP.
- Use tagged types from `lib/types.ts` whenever practical for function/module boundaries (especially IDs and domain inputs/outputs) instead of raw primitives.

## What We're NOT Doing
- Adding new auth providers.
- Building a full notification center.
- Adding global anti-abuse/rate-limiting infrastructure beyond basic validation.
- Building advanced email analytics dashboards.

## Implementation Approach
Use incremental vertical slices:
1. Stabilize environment and collaborator ownership invariants.
2. Bootstrap the test harness (unit, integration, e2e, aggregate gate).
3. Evolve schema and data model safely.
4. Add invitation domain services and email dispatch.
5. Add invite acceptance and auth continuation.
6. Expand owner UX for invitation operations.
7. Tie invite lifecycle into archive/delete and finalize release hardening.

Cross-cutting implementation rule:
- For all new or modified invitation/collaborator modules, prefer tagged types from `lib/types.ts` at API boundaries (server actions, helpers, services, and UI props) whenever feasible.
- Only use raw primitives internally where required by low-level libraries or SQL adapters.

## Version Control Workflow (Jujutsu)
- Before Phase 1, create the feature bookmark: `jj bookmark create implement-email-invitation-system` (or move an existing bookmark with `jj bookmark set implement-email-invitation-system -r @`).
- After each phase, make exactly one `jj` commit with a one-sentence message.
- Use these checkpoint commit commands:
1. `jj commit -m "Phase 1: Enforce owner collaborator invariants and add environment verification scaffolding."`
2. `jj commit -m "Phase 2: Bootstrap unit, integration, and e2e test harness tooling and scripts."`
3. `jj commit -m "Phase 3: Extend collaborator schema for invitation lifecycle with migration and backfill coverage."`
4. `jj commit -m "Phase 4: Implement invitation domain services and Resend email dispatch with automated tests."`
5. `jj commit -m "Phase 5: Add invite acceptance route and sign-in continuation with integration and e2e coverage."`
6. `jj commit -m "Phase 6: Deliver owner invitation management UI flows with automated verification."`
7. `jj commit -m "Phase 7: Integrate lifecycle hooks, webhook handling, and final release hardening checks."`

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
- `drizzle/ownerCollaborator.ts`
- `lib/types.ts`

**Changes**:
- Ensure list creation always creates/upserts an owner row in `list_collaborators`.
- Reuse one helper for owner-upsert logic from both list creation paths.
- Keep backfill script for historical rows and make it idempotent.
- Ensure `drizzle/ownerCollaborator.ts` uses tagged IDs from `lib/types.ts` for helper inputs/outputs whenever feasible (instead of raw `number` IDs).

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
- [x] Owner row is created/upserted when creating new lists (automated test or assertion).
- [x] `drizzle/ownerCollaborator.ts` helper surface uses tagged types from `lib/types.ts` for IDs wherever feasible.
- [x] `npm run verify:env` fails when required keys are missing.
- [x] `npm run verify:env` passes when keys are present.
- [x] `npm run typecheck` passes.

#### Manual Verification
- [ ] Required invitation/env values are configured in local and deployment environments.

**Implementation Note**: This is the only phase that requires a manual pause/confirmation.
**Jujutsu Checkpoint**: `jj commit -m "Phase 1: Enforce owner collaborator invariants and add environment verification scaffolding."`

---

## Phase 2: Test Harness Bootstrap

### Overview
Add the missing test infrastructure so all subsequent phases can be automatically validated.

### Changes Required

#### 1. Add unit/integration/e2e tooling
**Files**:
- `package.json`
- `vitest.config.ts` (new)
- `playwright.config.ts` (new)
- `tests/setup/*.ts` (new)

**Changes**:
- Add Vitest for unit and integration tests.
- Add Playwright for e2e smoke coverage.
- Add shared setup utilities and test environment config.

#### 2. Add standard verification scripts
**Files**:
- `package.json`

**Changes**:
- Add scripts:
  - `test:unit`
  - `test:integration`
  - `test:e2e:smoke`
  - `verify:all` (chaining env + typecheck + lint + all tests)

#### 3. Add baseline smoke tests
**Files**:
- `tests/unit/smoke.test.ts` (new)
- `tests/integration/smoke.test.ts` (new)
- `tests/e2e/smoke.spec.ts` (new)

**Changes**:
- Add minimal passing tests proving each harness layer executes in CI/local.

### Success Criteria

#### Automated Verification
- [x] `npm run test:unit` executes successfully.
- [x] `npm run test:integration` executes successfully.
- [x] `npm run test:e2e:smoke` executes successfully.
- [x] `npm run verify:all` executes successfully.

#### Manual Verification
- [x] None required.

**Jujutsu Checkpoint**: `jj commit -m "Phase 2: Bootstrap unit, integration, and e2e test harness tooling and scripts."`

---

## Phase 3: Schema Evolution for Invitation Lifecycle

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

#### 3. Add migration-focused integration coverage
**Files**:
- `tests/integration/invitations/schema-migration.test.ts` (new)

**Changes**:
- Add assertions for migration/backfill correctness and uniqueness constraints.

### Success Criteria

#### Automated Verification
- [ ] Migration applies cleanly on a fresh DB.
- [ ] Migration applies cleanly on existing DB state.
- [ ] Backfill results in zero legacy rows with invalid invite status.
- [x] Existing collaborator list screens still render accepted users only.
- [x] `npm run test:integration` passes schema/backfill tests.
- [x] `npm run typecheck` and `npm run lint` pass.

#### Manual Verification
- [x] None required.

**Jujutsu Checkpoint**: `jj commit -m "Phase 3: Extend collaborator schema for invitation lifecycle with migration and backfill coverage."`

---

## Phase 4: Invitation Domain Services and Email Dispatch

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

#### 3. Add unit and integration tests
**Files**:
- `tests/unit/invitations/*.test.ts` (new)
- `tests/integration/invitations/service.test.ts` (new)

**Changes**:
- Add tests for token hashing, expiry, duplicate open invite handling, and state transitions.
- Add integration tests for permission checks and DB writes.

### Success Criteria

#### Automated Verification
- [x] `npm run test:unit` passes invitation domain tests.
- [x] `npm run test:integration` passes invitation action/service tests.
- [x] Duplicate open invite reuses row and rotates token.
- [x] Revoke/approve/reject transitions are enforced by role and current status.
- [x] `npm run typecheck` and `npm run lint` pass.

#### Manual Verification
- [x] None required.

**Jujutsu Checkpoint**: `jj commit -m "Phase 4: Implement invitation domain services and Resend email dispatch with automated tests."`

---

## Phase 5: Invite Acceptance Route and Auth Continuation

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

#### 3. Add integration + e2e coverage
**Files**:
- `tests/integration/invitations/acceptance.test.ts` (new)
- `tests/e2e/invitations/acceptance.spec.ts` (new)

**Changes**:
- Verify redirect-to-sign-in behavior and resumed acceptance path.
- Verify match vs mismatch outcomes.

### Success Criteria

#### Automated Verification
- [x] `npm run test:integration` passes token validation and state rendering tests.
- [x] `npm run test:e2e:smoke` covers unauthenticated redirect and resumed acceptance.
- [x] Authenticated matching-email flow creates accepted collaborator membership.
- [x] `npm run typecheck` and `npm run lint` pass.

#### Manual Verification
- [x] None required.

**Jujutsu Checkpoint**: `jj commit -m "Phase 5: Add invite acceptance route and sign-in continuation with integration and e2e coverage."`

---

## Phase 6: Owner Invitation Management UX

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

#### 3. Add integration + e2e coverage
**Files**:
- `tests/integration/invitations/owner-ui-actions.test.ts` (new)
- `tests/e2e/invitations/owner-management.spec.ts` (new)

**Changes**:
- Validate owner-only constraints and pending-approval actions.
- Cover send/resend/revoke/copy flows in e2e smoke or targeted e2e suite.

### Success Criteria

#### Automated Verification
- [x] Owner-only access enforced for invite operations.
- [x] Collaborator/non-owner attempts fail with clear server errors.
- [x] Pending invites and accepted collaborators are rendered correctly.
- [x] `npm run test:integration` and `npm run test:e2e:smoke` pass relevant invite management scenarios.
- [x] `npm run typecheck` and `npm run lint` pass.

#### Manual Verification
- [x] None required.

**Jujutsu Checkpoint**: `jj commit -m "Phase 6: Deliver owner invitation management UI flows with automated verification."`

---

## Phase 7: Lifecycle Hooks, Webhook, and Release Hardening

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
- Ensure `npm run verify:all` is the single release gate.
- Document env requirements, migration order, and failure troubleshooting.

### Success Criteria

#### Automated Verification
- [x] `npm run test:integration` confirms archive/delete invalidates open invites.
- [x] `npm run test:integration` confirms webhook failure metadata persistence.
- [x] `npm run verify:all` passes in CI/local.

#### Manual Verification
- [ ] Optional post-deploy production smoke for real provider behavior; not a phase gate.

**Jujutsu Checkpoint**: `jj commit -m "Phase 7: Integrate lifecycle hooks, webhook handling, and final release hardening checks."`

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

### End-to-End Tests
- Invite link redirect to sign-in and return flow.
- Owner invitation management operations.
- Acceptance UX outcomes for valid/invalid/expired/pending states.

### Manual Smoke (Non-Blocking)
1. Confirm one real invitation email in deployed environment.
2. Confirm one webhook event from provider is accepted.

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
