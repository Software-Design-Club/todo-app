# Overview

Fix the collaborator-management permission regression where a legitimate owner can hit:

`Error: You do not have permission to view collaborators.`

on `/lists/collaborators`, by:

1. Reproducing it in authenticated e2e with a deterministic failure assertion.
2. Enforcing owner collaborator invariants at list creation time.
3. Strengthening the owner backfill script for legacy data.
4. Running full verification via `npm run verify:all`.
5. Committing phased work with `jj`.

# Progress

- [x] Phase 1: Reproduce the regression in authenticated e2e.
- [x] Phase 2: Enforce owner membership invariant at list creation.
- [x] Phase 3: Strengthen legacy backfill for existing data.
- [ ] Phase 4: Final verification and delivery.

# Current State Analysis

1. The collaborator management page loads owner lists then queries collaborator data for those lists (`app/lists/collaborators/page.tsx:15` and `app/lists/collaborators/page.tsx:20`).
2. Permission checks in collaborator read paths depend on accepted collaborator memberships; missing membership can throw the exact error above (`app/lists/_actions/collaborators.ts:227` and `app/lists/_actions/collaborators.ts:228`).
3. New list creation currently inserts into `lists` but does not upsert owner membership in `list_collaborators` (`app/lists/_actions/list.ts:179`).
4. Existing backfill upserts owner role, but does not explicitly normalize invitation status to accepted for all conflicting legacy rows (`drizzle/backfillListCollaborators.ts:32` and `drizzle/backfillListCollaborators.ts:38`).

# Desired End State

1. Owners can navigate to `/lists/collaborators` for lists they own without permission errors.
2. New list creation always guarantees an accepted owner row in `list_collaborators`.
3. Backfill script can repair legacy owner rows to accepted owner memberships.
4. Regression has authenticated e2e coverage that fails before fix and passes after fix.
5. Full verification gate passes before final handoff.

How to verify:

1. Run targeted e2e for the new regression test and confirm failure pre-fix.
2. Apply fix and rerun targeted e2e to confirm pass.
3. Run `npm run verify:all` and confirm all checks pass.
4. Manually create a list as an owner and navigate to `/lists/collaborators`; page should render successfully.

# Key Discoveries

1. Owner-list filtering and collaborator/invitation hydration happen on the collaborator management page (`app/lists/collaborators/page.tsx:16` and `app/lists/collaborators/page.tsx:19`).
2. Permission denial is thrown from collaborator read action after `canViewList` fails (`app/lists/_actions/collaborators.ts:227` and `app/lists/_actions/collaborators.ts:228`).
3. Private list view permission checks rely on collaborator membership presence (`app/lists/_actions/permissions.ts:78` and `app/lists/_actions/permissions.ts:80`).
4. `createList` currently omits owner-collaborator upsert, enabling data drift for newly created lists (`app/lists/_actions/list.ts:169` and `app/lists/_actions/list.ts:185`).
5. Backfill script exists and is idempotent by conflict handling, but currently focuses on role updates and needs accepted-status normalization (`drizzle/backfillListCollaborators.ts:24` and `drizzle/backfillListCollaborators.ts:39`).
6. Existing e2e invitation owner-management tests only cover unauthenticated flows and do not cover authenticated owner collaborator management access (`tests/e2e/invitations/owner-management.spec.ts:24`).

# Implementation Phases

## Phase 1: Reproduce the Regression in Authenticated E2E

1. Extend `tests/e2e/invitations/owner-management.spec.ts` with an authenticated-owner flow.
2. Seed a test user directly in DB and set an Auth.js `authjs.session-token` cookie generated with `AUTH_SECRET`.
3. Drive real UI flow to create a list from `/lists` (`+ New List`, submit title).
4. Navigate to `/lists/collaborators` and assert expected behavior.
5. Add explicit failure-shape assertion: if navigation fails, assert response/error page contains `You do not have permission to view collaborators.`.

Automated checks:

1. Run targeted Playwright test to prove pre-fix failure shape.

Jujutsu checkpoint:

1. `jj commit -m "test: add e2e repro for owner collaborators permission regression"`

## Phase 2: Enforce Owner Membership Invariant at List Creation

1. Update `app/lists/_actions/list.ts` `createList` so list creation also upserts owner membership into `list_collaborators`.
2. Ensure upsert normalizes ownership fields:
   - `role = 'owner'`
   - `inviteStatus = 'accepted'`
   - `inviteAcceptedAt` set/preserved
   - `updatedAt` refreshed
3. Keep runtime permission checks strict (no runtime owner fallback).

Automated checks:

1. Rerun targeted e2e to confirm regression is fixed for newly created lists.
2. Run `npm run typecheck` and `npm run lint`.

Jujutsu checkpoint:

1. `jj commit -m "fix: upsert accepted owner collaborator membership on list creation"`

## Phase 3: Strengthen Legacy Backfill for Existing Data

1. Update `drizzle/backfillListCollaborators.ts` so conflict updates also normalize:
   - `inviteStatus = 'accepted'`
   - `inviteAcceptedAt` set/preserved
   - `role = 'owner'`
2. Preserve idempotence and logging for repeatable operations.
3. Ensure script behavior remains safe for mixed legacy states.

Automated checks:

1. Run relevant tests touching collaborator permissions/invitations.
2. Optionally dry-run script behavior in staging-like environment before production run.

Jujutsu checkpoint:

1. `jj commit -m "fix: normalize owner collaborator rows to accepted status in backfill"`

## Phase 4: Final Verification and Delivery

1. Run full quality gate: `npm run verify:all`.
2. Re-run targeted e2e regression to confirm stability.
3. Summarize verification output and changed files for delivery.

Automated checks:

1. `npm run verify:all` passes.
2. Targeted collaborator-management regression e2e passes.

Jujutsu checkpoint:

1. `jj commit -m "chore: verify collaborator permission regression fix across full suite"`

# Success Criteria

Automated:

1. New authenticated e2e regression test is present and deterministic.
2. Test fails on old behavior with the expected permission error.
3. Test passes after owner invariant + backfill fixes.
4. `npm run verify:all` passes.

Manual:

1. Owner can create a new list and immediately access `/lists/collaborators`.
2. Legacy lists repaired by backfill also load correctly for owners.

# What We Are Not Doing

1. No runtime permission fallback that infers owner access without membership.
2. No broad redesign of list permission architecture.
3. No unrelated invitation lifecycle or UI refactors outside this regression scope.
4. No schema redesign beyond data invariant enforcement through action/backfill code.
