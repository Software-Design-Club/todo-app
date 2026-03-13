# Unify Invite Flow — Implementation Plan

## Review Outcome

Ready to implement. All contracts are explicit and trace to the functional spec and technical spec. Parallel execution is viable for Phases 1a and 1b. No new dependencies are required. Brainstorm walkthrough completed 2026-03-13; human approved E3b (TypeScript enforcement replaces dedicated e2e regression for `router.refresh` branch).

---

## Global Contract Rules

- Every phase starts from a clean working copy (`jj status`). If dirty, stop and run `jj new` before touching code.
- Every code change is preceded by a failing contract test. No green before red.
- Execute one RED → GREEN → REFACTOR loop per contract test before adding the next.
- Tests assert on observable contracts only — function inputs, return values, DB mutations, thrown error types. No assertions on internal implementation details.
- New domain types use tagged/branded representations from `type-fest`; raw primitive aliases are not acceptable.
- No behavior is invented outside the functional spec (stage-6) and technical spec (stage-7).
- `npm run typecheck` and `npm run lint` must pass at each phase gate.
- Integration tests inject the transaction client via `vi.doMock("@vercel/postgres")` — the existing pattern from `tests/integration/setup/integration.ts`.

---

## Overview

Replace the `searchUsers` + `addCollaborator` direct-insert flow inside the `ManageCollaborators` dropdown with a proper invitation workflow. Add email normalization at account creation. Introduce `searchInvitableUsers` with server-side exclusion filters. Unify both invite entry points (search-select and email form) behind a single `InviteCollaboratorResult` tagged union. Add optimistic pending-invitations state so successful invites are immediately visible without a page reload.

---

## Current State Analysis

### What Exists Today

- `searchUsers` (`app/lists/_actions/collaborators.ts:14`) — no exclusion filters, no auth check, returns all matching users
- `addCollaborator` (`app/lists/_actions/collaborators.ts:50`) — inserts directly into `list_collaborators`, no auth/permission check, no invitation record
- `inviteCollaborator` (`app/lists/_actions/invitations.ts:55`) — returns raw `InviteCollaboratorWorkflowResult`; no `expiresAt` in return; no catch/fold; one caller (`InviteByEmailForm`) inspects `emailServiceResponse.kind` directly
- `InviteByEmailForm` — always calls `router.refresh()` in `finally`; no `onSuccess` prop
- `ManageCollaborators` — reads `initialInvitations` as a prop directly into render; `invitations` is not in local state; uses `addCollaboratorMutation` → `addCollaborator`
- `findOrCreateAccount` (`app/sign-in/_components/_actions/find-or-create-account.ts:14`) — inserts `credentials.email` as-is (no trim/lowercase)
- `InviteCollaboratorWorkflowResult` — no `expiresAt` field

### Gaps Blocking Implementation

- `searchInvitableUsers` does not exist; `searchUsers` has no `listId` parameter and no exclusion queries
- `InviteCollaboratorResult` tagged union does not exist
- `inviteCollaborator` does not call `assertCanManageCollaborators`; does not catch and fold errors
- `InviteCollaboratorWorkflowResult` does not expose `expiresAt`
- `InviteByEmailForm` cannot propagate `SentInvitationSummary` to parent
- `ManageCollaborators` has no `invitations` local state — optimistic updates are impossible

---

## Desired End State

- New user accounts have trimmed, lowercased emails in `UsersTable`
- `searchInvitableUsers(term, listId)` returns pre-filtered results excluding current collaborators and users with open invitations
- `inviteCollaborator` returns `InviteCollaboratorResult` — a tagged union with `kind: "success" | "failure"`; throws on permission denied; folds delivery and workflow errors into `{ kind: "failure" }`
- `addCollaborator` does not exist anywhere in the codebase
- `ManageCollaborators` dropdown updates the pending list immediately after a successful invite, without closing or reloading
- `InviteByEmailForm` supports an optional `onSuccess` callback that skips `router.refresh()`

---

## End-State Verification

- `npm run typecheck` — zero errors (confirms `addCollaborator` is fully deleted)
- `npm run lint` — zero warnings
- `npm run test:unit` — all pass
- `npm run test:integration` — all pass including new contracts

---

## Locked Decisions

- Permission errors throw from `inviteCollaborator` (P1) — not folded into `InviteCollaboratorResult`
- `SentInvitationSummary` is constructed inline in the server action (no helper — BD3)
- `router.refresh()` regression for collaborators page is TypeScript-enforced, not e2e-tested (E3b)
- No new npm packages — `notInArray` is available from `drizzle-orm`

---

## What We Are Not Doing

- Backfill of existing `UsersTable` emails
- DB migration — no schema changes
- Invitation management controls (revoke, resend, copy-link) in the search panel
- `createSentInvitationSummary` helper
- Visual redesign of the search panel or email form
- E2E test for the `router.refresh()` regression branch (E3b)

---

## Version Control Workflow (Jujutsu)

- Each phase starts from a clean working copy: `jj status` must show no changes before first code edit
- If the working copy is dirty when a phase begins, stop and run `jj new` before any edits
- At phase completion: `jj describe -m "phase [X]: [summary]"`
- Before the next phase: `jj new -m "phase [X+1]: start"`
- For parallel chunks (1a ∥ 1b): use `jj workspace add` to create isolated workspaces per the `using-jj-workspaces` skill; merge both workspaces before starting Phase 2

---

## Parallel Execution Strategy

### Chunk Dependency Map

#### Chunk 1a: Email Normalization (Phase 1a)
- Depends on: `none`
- Unblocks: `none` (independent of all other chunks)
- Parallelizable with: Chunk 1b
- Workspace strategy: isolated jj workspace (`jj workspace add`) — merge into main working copy before Phase 2 begins

#### Chunk 1b: searchInvitableUsers (Phase 1b)
- Depends on: `none`
- Unblocks: Chunk 2
- Parallelizable with: Chunk 1a
- Workspace strategy: isolated jj workspace (`jj workspace add`) — merge into main working copy before Phase 2 begins

#### Chunk 2: Invite Routing (Phase 2)
- Depends on: Chunk 1b (searchInvitableUsers must be merged before Phase 2 code is written)
- Unblocks: Chunk 3
- Parallelizable with: `none`
- Workspace strategy: single shared working copy (sequential)

#### Chunk 3: Optimistic UI (Phase 3)
- Depends on: Chunk 2
- Unblocks: `none`
- Parallelizable with: `none`
- Workspace strategy: single shared working copy (sequential)

---

## Dependency and Third-Party Delta

### New or Changed Dependencies

None. All required utilities (`notInArray`, `inArray`, `and`, `or`, `ilike`, `eq` from `drizzle-orm`) are already present.

### New External APIs and Hosted Services

None.

### Per-Phase Ownership and Earliest Introduction Point

No new packages to introduce.

### Installation/Provisioning and Verification Commands

N/A

---

## Phase 1a: Email Normalization

### Goal

Normalize user email at write time in `findOrCreateAccount` so that `UsersTable.email` is always trimmed and lowercased for new accounts. Existing rows are not touched.

### Phase Execution Rules

- Governing specifications: `plan/unify-invite-flow/stage-6-final-spec.md` (Slice A), `plan/unify-invite-flow/stage-7-technical-spec.md` (Contract §1)
- Required context: `findOrCreateAccount` does a SELECT by exact email before INSERT; the SELECT lookup is unchanged — normalization applies to the INSERT value only
- Dependencies / prerequisites: none
- Dependency/service deltas introduced: none
- Chunk dependencies: none (can start immediately)
- Unblocks: nothing depends on this chunk
- Parallelization note: run in isolated jj workspace alongside Phase 1b
- Phase start hygiene: `jj status` must be clean; if dirty, run `jj new` first
- Relevant existing files:
  - `app/sign-in/_components/_actions/find-or-create-account.ts` — the INSERT to modify
  - `tests/integration/invitations/collaborator-management.test.ts` — pattern reference for integration test structure
- Constraints / non-goals: no backfill, no migration, no change to `getUser` lookup
- Execution order: write failing test first, then the normalization line, then confirm GREEN
- Testing strategy source of truth: Phase Test Strategy and Phase Test Checklist below
- Agent handoff note: this phase touches exactly one line in `findOrCreateAccount`. The test verifies the DB row. No other files change.

### Specifications

#### Contract 1a.1: New account email is stored normalized

When `findOrCreateAccount` is called with `credentials.email` that contains uppercase letters or surrounding whitespace, the `UsersTable.email` value written to the database is the result of `credentials.email.trim().toLowerCase()`.

**Precondition:** No existing row in `UsersTable` matches `credentials.email` (exact match).
**Postcondition:** A row is inserted with `email = credentials.email.trim().toLowerCase()`.
**Side effects:** `ListsTable` and `TodosTable` rows are also inserted (existing behavior, not tested here).

#### Contract 1a.2: Existing accounts are not modified

When `findOrCreateAccount` is called with an email that already exists in `UsersTable`, no UPDATE is performed and the existing email value is unchanged.

**Precondition:** A row exists in `UsersTable` with `email = credentials.email` (exact match).
**Postcondition:** No INSERT is performed. No row is modified.

### Contract Coverage Checklist

#### Contract 1a.1 checklist
- [ ] New account created with `Alice@Example.com` → stored as `alice@example.com`
- [ ] New account created with `" bob@example.com "` (padded) → stored as `bob@example.com`

#### Contract 1a.2 checklist
- [ ] Calling `findOrCreateAccount` twice with the same email → only one row exists, email unchanged

### Specification-Driven TDD Workflow

- First test: `new account with mixed-case email stores lowercase` → RED (assertion on SELECT after INSERT fails before normalization code exists)
- Remaining test inventory:
  1. `new account with padded email stores trimmed` — RED then GREEN
  2. `existing account is not modified on second call` — RED then GREEN (verifies no double-insert)
- Execution rule: complete RED → GREEN → REFACTOR for each test before adding the next
- Delete-and-rebuild note: `findOrCreateAccount` is a short function; adapt in place (do not rebuild)
- Commands:
  - `npm run test:integration -- --reporter=verbose tests/integration/sign-in/find-or-create-account.test.ts`
  - `npm run typecheck`
  - `npm run lint`

### Phase Test Strategy

- Contract-to-test mapping: 1a.1 → T1, T2; 1a.2 → T3
- Test level: integration (real DB inside transaction)
- Execution order: T1 first (mixed-case → proves normalization), T2 (padded → proves trim), T3 (idempotent → proves no regression)
- Evidence capture: terminal output from integration test run logged at phase gate

### Phase Test Checklist (Mark Green During Implementation)

- [ ] `T1` mixed-case email stored lowercase — covers Contract 1a.1, command: `npm run test:integration -- tests/integration/sign-in/find-or-create-account.test.ts`
- [ ] `T2` padded email stored trimmed — covers Contract 1a.1, command: same
- [ ] `T3` existing account not modified — covers Contract 1a.2, command: same

### Files

- `app/sign-in/_components/_actions/find-or-create-account.ts` — add `.trim().toLowerCase()` to email value in INSERT (one line change)
- `tests/integration/sign-in/find-or-create-account.test.ts` — new test file (create `tests/integration/sign-in/` directory)

### Phase Gate

#### Automated Verification
- [ ] Phase started from a clean working copy
- [ ] Specification exists (stage-6 Slice A, stage-7 §1)
- [ ] All three contract tests are RED before implementation, GREEN after
- [ ] `npm run test:integration -- tests/integration/sign-in/find-or-create-account.test.ts` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes

#### Manual Verification
- [ ] Inspect: no other files were modified in this phase

---

## Phase 1b: searchInvitableUsers

### Goal

Introduce `searchInvitableUsers(term, listId)` in `collaborators.ts`. A single DB query applies both exclusion filters (accepted collaborators and open-invitation users) server-side. The new action replaces the `searchUsers` call in `ManageCollaborators`.

### Phase Execution Rules

- Governing specifications: `plan/unify-invite-flow/stage-6-final-spec.md` (Slice B), `plan/unify-invite-flow/stage-7-technical-spec.md` (Contract §2)
- Required context: `notInArray` is imported from `drizzle-orm`; the query uses two nested `db.select` subqueries as exclusion sets; returns `User[]` (same type as `searchUsers`)
- Dependencies / prerequisites: none
- Dependency/service deltas: none
- Chunk dependencies: none (runs in parallel with 1a)
- Unblocks: Chunk 2 (Phase 2 wires this action into the component)
- Parallelization note: run in isolated jj workspace alongside Phase 1a
- Phase start hygiene: `jj status` clean; if dirty, `jj new` first
- Relevant existing files:
  - `app/lists/_actions/collaborators.ts:14` — `searchUsers` (reference for ilike pattern; NOT removed in this phase)
  - `tests/integration/invitations/collaborator-management.test.ts` — `insertUser`, `insertList`, `addCollaboratorRow`, `insertOpenInvitation` helpers are copy-portable to the new test file
- Constraints / non-goals: do not remove `searchUsers` in this phase; do not wire the new action into the component (Phase 2 does this); no client-side filtering
- Execution order: write each failing test, implement just enough query logic to turn it GREEN, then add the next test
- Testing strategy source of truth: Phase Test Strategy and Phase Test Checklist below
- Agent handoff note: add `searchInvitableUsers` as a new export in `collaborators.ts`. Write the integration test in a new file `tests/integration/invitations/search-invitable-users.test.ts`. Do not modify the component or remove `searchUsers`.

### Specifications

#### Contract 1b.1: Accepted collaborators excluded from results

A user who has a row in `list_collaborators` for the target `listId` (any role) does not appear in `searchInvitableUsers` results even if their name/email matches the search term.

#### Contract 1b.2: Users with open `sent` invitation excluded

A user whose `UsersTable.email` equals an `invitations.invitedEmailNormalized` for a `status = 'sent'` invitation on the target `listId` does not appear in results.

#### Contract 1b.3: Users with open `pending` invitation excluded

Same as 1b.2 but for `status = 'pending'`.

#### Contract 1b.4: Unconnected user appears in results

A user with no row in `list_collaborators` and no open invitation for the target `listId` appears in results when their name or email matches the search term.

#### Contract 1b.5: Single DB query (no client-side filtering)

The search executes exactly one database round-trip. Both exclusions are subquery expressions within that single query.

### Contract Coverage Checklist

#### Contract 1b.1 checklist
- [ ] User A is owner on list L → not in results for a term matching A

#### Contract 1b.1 (collaborator role)
- [ ] User A is collaborator (non-owner) on list L → not in results

#### Contract 1b.2 checklist
- [ ] User B has `status = 'sent'` invitation on list L → not in results

#### Contract 1b.3 checklist
- [ ] User C has `status = 'pending'` invitation on list L → not in results

#### Contract 1b.4 checklist
- [ ] User D has no connection to list L → appears in results

#### Contract 1b.5 checklist
- [ ] With query counter mock (same pattern as `importInvitationServicesWithQueryCounter`): exactly 1 query executed

### Specification-Driven TDD Workflow

- First test: `excludes existing collaborator` → RED (query has no NOT IN → accepted collaborator leaks through)
- Remaining test inventory:
  1. `excludes owner role` — RED then GREEN (covers the `any role` edge)
  2. `excludes user with sent invitation` — RED then GREEN
  3. `excludes user with pending invitation` — RED then GREEN
  4. `returns unconnected user` — RED then GREEN
  5. `single DB query` — RED then GREEN (query counter)
- Execution rule: one RED → GREEN → REFACTOR per test
- Delete-and-rebuild note: `searchUsers` is not touched; `searchInvitableUsers` is a new function written from scratch
- Commands:
  - `npm run test:integration -- tests/integration/invitations/search-invitable-users.test.ts`
  - `npm run typecheck`
  - `npm run lint`

### Phase Test Strategy

- Contract-to-test mapping: 1b.1 → T1 + T2; 1b.2 → T3; 1b.3 → T4; 1b.4 → T5; 1b.5 → T6
- Test level: integration (real DB in transaction)
- Execution order: T1 (simplest exclusion), T2 (edge role), T3 (sent invitation), T4 (pending), T5 (positive case), T6 (query count)
- Evidence capture: terminal output from integration test run

### Phase Test Checklist (Mark Green During Implementation)

- [ ] `T1` excludes accepted collaborator — covers 1b.1, command: `npm run test:integration -- tests/integration/invitations/search-invitable-users.test.ts`
- [ ] `T2` excludes owner-role collaborator — covers 1b.1, same command
- [ ] `T3` excludes user with sent invitation — covers 1b.2, same command
- [ ] `T4` excludes user with pending invitation — covers 1b.3, same command
- [ ] `T5` returns unconnected user — covers 1b.4, same command
- [ ] `T6` single DB query — covers 1b.5, same command

### Files

- `app/lists/_actions/collaborators.ts` — add `searchInvitableUsers` export (new function; `searchUsers` untouched)
- `tests/integration/invitations/search-invitable-users.test.ts` — new test file with import helpers following the pattern from `collaborator-management.test.ts`

### Phase Gate

#### Automated Verification
- [ ] Phase started from a clean working copy
- [ ] Specification exists (stage-6 Slice B, stage-7 §2)
- [ ] All six contract tests are RED before implementation, GREEN after
- [ ] `npm run test:integration -- tests/integration/invitations/search-invitable-users.test.ts` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes

#### Manual Verification
- [ ] `searchUsers` is still present and unchanged (this phase adds, does not remove)
- [ ] No component files were modified

---

## Phase 2: Invite Routing

### Goal

Wire the invitation workflow end-to-end in the search-select path. Introduce `InviteCollaboratorResult`. Expose `expiresAt` on `InviteCollaboratorWorkflowResult`. Rewrite `inviteCollaborator` to return the tagged union (with permission throws preserved, delivery/workflow errors folded). Delete `addCollaborator`. Update `ManageCollaborators` to call `inviteCollaborator`, rename the CTA to "Invite {name}", handle errors without clearing panel state, and replace `searchUsers` with `searchInvitableUsers`.

### Phase Execution Rules

- Governing specifications: `plan/unify-invite-flow/stage-6-final-spec.md` (Slice C), `plan/unify-invite-flow/stage-7-technical-spec.md` (Contracts §3–§5 partial)
- Required context: `inviteCollaboratorWorkflow` already calls `assertCanInviteCollaborators`; the server action now also calls `assertCanManageCollaborators` before the try-catch; permission check throws `CollaboratorManagementPermissionDeniedError`; delivery failure is detected via `result.emailServiceResponse.kind === "rejected"`
- Dependencies / prerequisites: Phase 1b merged into working copy (searchInvitableUsers available)
- Dependency/service deltas: none
- Chunk dependencies: Chunk 1b must be complete and merged
- Unblocks: Chunk 3
- Parallelization note: sequential; no parallel work possible here
- Phase start hygiene: `jj status` clean; if dirty, `jj new`
- Relevant existing files:
  - `lib/types.ts` — add `InviteCollaboratorResult` type
  - `lib/invitations/service.ts:266` — `inviteCollaboratorWorkflow` return; add `expiresAt`
  - `app/lists/_actions/invitations.ts:55` — `inviteCollaborator`; full rewrite of return type and body
  - `app/lists/_actions/collaborators.ts:50` — `addCollaborator`; delete
  - `app/lists/_components/manage-collaborators.tsx` — replace mutation + search action + button label
  - `tests/integration/invitations/collaborator-management.test.ts` — extend with new describe block
- Constraints / non-goals: optimistic state update (Phase 3); invitation management controls (out of scope)
- Execution order: (1) add type, (2) extend workflow result, (3) rewrite server action, (4) delete `addCollaborator`, (5) update component — each preceded by its contract test
- Testing strategy source of truth: Phase Test Strategy and Phase Test Checklist below
- Agent handoff note: This phase has the most moving parts. Start with the type in `lib/types.ts` then the workflow result change then the server action rewrite. The component change should come last after all server-side contracts are green. `addCollaborator` deletion is confirmed green when `npm run typecheck` passes with zero errors.

### Specifications

#### Contract 2.1: `InviteCollaboratorResult` type definition

```typescript
// lib/types.ts
export type InviteCollaboratorResult =
  | { kind: "success"; invitation: SentInvitationSummary }
  | { kind: "failure"; errorMessage: string };
```

`kind` is a literal discriminant. `invitation` in the success variant is `SentInvitationSummary` (not the union `InvitationSummary`). `errorMessage` is always a non-empty string constructed server-side.

#### Contract 2.2: `InviteCollaboratorWorkflowResult` exposes `expiresAt`

`inviteCollaboratorWorkflow` return value includes `expiresAt: InvitationExpiry`, sourced from `persistedInvitation.expiresAt`. No additional DB read is required.

**Precondition:** `issueInvitation` returns `PersistedSentInvitation` which already contains `expiresAt`.
**Postcondition:** `InviteCollaboratorWorkflowResult.expiresAt` equals the `expiresAt` written to the `invitations` row.

#### Contract 2.3: `inviteCollaborator` returns `InviteCollaboratorResult` on success

When the workflow succeeds and email delivery is accepted (`emailServiceResponse.kind === "accepted"`), `inviteCollaborator` returns:
```
{ kind: "success", invitation: { kind: "sent", invitationId, listId, invitedEmailNormalized, expiresAt } }
```
where `invitedEmailNormalized = input.invitedEmail.trim().toLowerCase() as NormalizedEmailAddress`.

No `list_collaborators` row is inserted.

#### Contract 2.4: `inviteCollaborator` folds delivery failure into `{ kind: "failure" }`

When the workflow completes but `emailServiceResponse.kind === "rejected"`, `inviteCollaborator` returns:
```
{ kind: "failure", errorMessage: "Invitation saved but email delivery failed: {errorMessage}" }
```
where `{errorMessage}` is `emailServiceResponse.errorMessage`.

#### Contract 2.5: `inviteCollaborator` folds workflow errors into `{ kind: "failure" }`

When `inviteCollaboratorWorkflow` throws any error that is not a permission error, `inviteCollaborator` returns:
```
{ kind: "failure", errorMessage: error.message || "Failed to send invitation." }
```

#### Contract 2.6: `inviteCollaborator` throws on permission denied

When the caller is not an owner of `listId`, `assertCanManageCollaborators` throws `CollaboratorManagementPermissionDeniedError`. This error propagates out of `inviteCollaborator` — it is **not** folded into `{ kind: "failure" }`.

#### Contract 2.7: `addCollaborator` does not exist

After deletion, no symbol named `addCollaborator` exists anywhere in the codebase. TypeScript build passes.

#### Contract 2.8: Confirmation button label is "Invite {name}"

In `ManageCollaborators`, the confirmation button label reads `"Invite {selectedUserToAdd.name}"`. The disabled/loading state is preserved during in-flight requests.

### Contract Coverage Checklist

#### Contract 2.1 checklist
- [ ] `InviteCollaboratorResult` is exported from `lib/types.ts`
- [ ] Success variant contains `SentInvitationSummary` (not union)
- [ ] Failure variant contains non-empty `errorMessage: string`

#### Contract 2.2 checklist
- [ ] `inviteCollaboratorWorkflow` result includes `expiresAt`
- [ ] `expiresAt` equals the value written to `invitations.expiresAt`

#### Contract 2.3 checklist
- [ ] Returns `{ kind: "success" }` when email accepted
- [ ] `invitation.invitedEmailNormalized` is trimmed and lowercased
- [ ] No row in `list_collaborators` after successful invite
- [ ] `invitation.expiresAt` is present and matches workflow result

#### Contract 2.4 checklist
- [ ] Returns `{ kind: "failure" }` when delivery rejected
- [ ] `errorMessage` begins with `"Invitation saved but email delivery failed: "`
- [ ] Panel-state preservation is not tested at the server level (component responsibility)

#### Contract 2.5 checklist
- [ ] Returns `{ kind: "failure" }` when workflow throws
- [ ] `errorMessage` equals thrown error's `.message` when available
- [ ] `errorMessage` equals `"Failed to send invitation."` when error has no message

#### Contract 2.6 checklist
- [ ] Unauthorized call throws `CollaboratorManagementPermissionDeniedError`
- [ ] The thrown error is not wrapped in a `{ kind: "failure" }` result

#### Contract 2.7 checklist
- [ ] `npm run typecheck` passes with zero errors after deletion

#### Contract 2.8 checklist
- [ ] Button text renders `"Invite {name}"` (verified visually or via TypeScript string template)

### Specification-Driven TDD Workflow

- First test: `inviteCollaborator returns { kind: "success" } when email accepted` (integration, mocks auth + email service) → RED (current action returns raw workflow result, not tagged union)
- Remaining test inventory:
  1. `expiresAt present on workflow result` — integration test extending `service.test.ts`
  2. `inviteCollaborator returns { kind: "failure" } on delivery rejection`
  3. `inviteCollaborator returns { kind: "failure" } on workflow error`
  4. `inviteCollaborator throws CollaboratorManagementPermissionDeniedError for non-owner`
  5. `no list_collaborators row after invite`
  6. `addCollaborator deleted — typecheck passes` (no unit test needed; typecheck is the proof)
- Execution rule: one loop per test; typecheck after deletion
- Delete-and-rebuild note: `inviteCollaborator` body is rebuilt (wrap existing workflow call in try-catch, add permission check before it); `addCollaborator` is deleted (not adapted)
- Commands:
  - `npm run test:integration -- tests/integration/invitations/collaborator-management.test.ts`
  - `npm run test:integration -- tests/integration/invitations/service.test.ts`
  - `npm run typecheck`
  - `npm run lint`

### Phase Test Strategy

- Contract-to-test mapping: 2.1 → type-level (typecheck), 2.2 → T1 (service integration), 2.3 → T2, 2.4 → T3, 2.5 → T4, 2.6 → T5, 2.7 → typecheck, 2.8 → manual/visual
- Test levels: integration (server action + service), typecheck (deletion + type shape)
- Execution order: service contract first (2.2), then action contracts (2.3–2.6), then deletion (2.7)
- Evidence capture: terminal output from integration runs + typecheck

### Phase Test Checklist (Mark Green During Implementation)

- [ ] `T1` workflow result includes expiresAt — covers 2.2, command: `npm run test:integration -- tests/integration/invitations/service.test.ts`
- [ ] `T2` inviteCollaborator success returns tagged union — covers 2.3, command: `npm run test:integration -- tests/integration/invitations/collaborator-management.test.ts`
- [ ] `T3` delivery failure folds into { kind: "failure" } — covers 2.4, same command
- [ ] `T4` workflow error folds into { kind: "failure" } — covers 2.5, same command
- [ ] `T5` non-owner call throws CollaboratorManagementPermissionDeniedError — covers 2.6, same command
- [ ] `T6` no list_collaborators row created — covers 2.3 side effect, same command
- [ ] `T7` typecheck passes after addCollaborator deletion — covers 2.7, command: `npm run typecheck`
- [ ] `T8` lint passes — command: `npm run lint`

### Files

- `lib/types.ts` — add `InviteCollaboratorResult` export
- `lib/invitations/service.ts` — add `expiresAt: persistedInvitation.expiresAt` to `inviteCollaboratorWorkflow` return object; update `InviteCollaboratorWorkflowResult` type
- `app/lists/_actions/invitations.ts` — rewrite `inviteCollaborator`: add `assertCanManageCollaborators` before try-catch, wrap workflow in try-catch, fold delivery rejection and errors, return `InviteCollaboratorResult`; update imports
- `app/lists/_actions/collaborators.ts` — delete `addCollaborator` function
- `app/lists/_components/manage-collaborators.tsx` — replace `addCollaboratorMutation` with `inviteCollaborator` call; rename button to `"Invite {name}"`; handle `result.kind === "failure"` (toast, preserve panel); replace `searchUsers` import with `searchInvitableUsers`; remove `addCollaborator` import

### Phase Gate

#### Automated Verification
- [ ] Phase started from a clean working copy (after 1a + 1b merged)
- [ ] Specification exists (stage-6 Slice C, stage-7 §3–§5)
- [ ] All contract tests RED before code, GREEN after
- [ ] `npm run test:integration -- tests/integration/invitations/collaborator-management.test.ts` passes
- [ ] `npm run test:integration -- tests/integration/invitations/service.test.ts` passes
- [ ] `npm run typecheck` passes (confirms addCollaborator deletion)
- [ ] `npm run lint` passes

#### Manual Verification
- [ ] Confirmation button reads "Invite {name}" in the browser
- [ ] Error toast appears and panel stays open when email delivery is simulated to fail
- [ ] No `list_collaborators` row visible in DB after invite (check DB directly or via existing collaborators query)

---

## Phase 3: Optimistic UI

### Goal

Lift `invitations` to local state in `ManageCollaborators`. Add an optional `onSuccess: (invitation: SentInvitationSummary) => void` prop to `InviteByEmailForm`. Wire both invite paths to append `SentInvitationSummary` to local state. Guard `router.refresh()` so it only fires when `onSuccess` is absent. Clear the search panel on success.

### Phase Execution Rules

- Governing specifications: `plan/unify-invite-flow/stage-6-final-spec.md` (Slice D), `plan/unify-invite-flow/stage-7-technical-spec.md` (Contracts §5–§6)
- Required context: `SentInvitationSummary` is the concrete type (not union) appended to state; `invitations` state is initialized once from `initialInvitations` prop with no `useEffect` sync; the `router.refresh()` removal inside the dropdown is guarded by `if (!onSuccess)` (equivalently `else { router.refresh() }`)
- Dependencies / prerequisites: Phase 2 complete (`inviteCollaborator` returns `InviteCollaboratorResult`; `SentInvitationSummary` is available from the success result)
- Dependency/service deltas: none
- Chunk dependencies: Chunk 2 complete
- Unblocks: nothing
- Parallelization note: sequential; no parallel work
- Phase start hygiene: `jj status` clean; if dirty, `jj new`
- Relevant existing files:
  - `app/lists/_components/manage-collaborators.tsx` — add state, wire both paths
  - `app/lists/_components/invite-by-email-form.tsx` — add `onSuccess` prop, guard `router.refresh()`
  - `app/lists/_components/pending-invitations-list.tsx` — read from local state (may need no change if already accepts `InvitationSummary[]`)
- Constraints / non-goals: no `useEffect` for prop-to-state sync; no `router.refresh()` inside the dropdown after success; no visual redesign
- Execution order: (1) `InviteByEmailForm` prop + router guard, (2) `ManageCollaborators` state + append for both paths — each preceded by a failing TypeScript check or unit test
- Testing strategy source of truth: Phase Test Strategy and Phase Test Checklist below
- Agent handoff note: the primary verification tool for this phase is `npm run typecheck`. The TypeScript signatures enforce the contract: `onSuccess?: (invitation: SentInvitationSummary) => void` ensures structural match alone is not acceptable. Behavioral checks (dropdown stays open, pending list updates) are verified manually in the browser.

### Specifications

#### Contract 3.1: `InviteByEmailForm` `onSuccess` prop

```typescript
type InviteByEmailFormProps = {
  listId: List["id"];
  onSuccess?: (invitation: SentInvitationSummary) => void;
};
```

When `result.kind === "success"` and `onSuccess` is provided: `onSuccess(result.invitation)` is called; `router.refresh()` is **not** called.
When `result.kind === "success"` and `onSuccess` is absent: `router.refresh()` is called; `onSuccess` is not called.
On failure: neither `onSuccess` nor `router.refresh()` is called; `toast.error` fires.

The `finally { router.refresh() }` block is removed. The `router.refresh()` call moves to an `else` branch.

#### Contract 3.2: `ManageCollaborators` `invitations` state

```typescript
const [invitations, setInvitations] = useState<InvitationSummary[]>(initialInvitations);
```

State is initialized once from `initialInvitations` at mount. No `useEffect` syncs the prop into state after mount.

#### Contract 3.3: Search-select success appends `SentInvitationSummary`

When `inviteCollaborator` returns `{ kind: "success" }` from the search-select path:
1. `setInvitations(prev => [...prev, result.invitation])` is called with `result.invitation` typed as `SentInvitationSummary` (not the union).
2. Search input is cleared.
3. Results list is cleared.
4. `selectedUserToAdd` is set to `null`.
5. Dropdown does not close.
6. `router.refresh()` is not called.

#### Contract 3.4: Email form `onSuccess` appends `SentInvitationSummary`

`InviteByEmailForm` inside `ManageCollaborators` is rendered with:
```typescript
onSuccess={(invitation) => setInvitations((prev) => [...prev, invitation])}
```
where `invitation` is `SentInvitationSummary`. The pending list reflects the new entry without a page reload.

### Contract Coverage Checklist

#### Contract 3.1 checklist
- [ ] `onSuccess` prop is typed `(invitation: SentInvitationSummary) => void` (not union)
- [ ] `router.refresh()` is absent from `finally` block
- [ ] When `onSuccess` present: `router.refresh()` not called
- [ ] When `onSuccess` absent: `router.refresh()` called on success

#### Contract 3.2 checklist
- [ ] `useState<InvitationSummary[]>(initialInvitations)` present
- [ ] No `useEffect` that writes to the `invitations` state variable

#### Contract 3.3 checklist
- [ ] `setInvitations` called with `result.invitation` (typed `SentInvitationSummary`)
- [ ] Search input cleared on success
- [ ] Results cleared on success
- [ ] `selectedUserToAdd` reset to null on success
- [ ] No `router.refresh()` call after search-select success

#### Contract 3.4 checklist
- [ ] `InviteByEmailForm` receives `onSuccess` prop in `ManageCollaborators`
- [ ] `onSuccess` receives `invitation: SentInvitationSummary`

### Specification-Driven TDD Workflow

- First test: TypeScript compile check — add `onSuccess` prop to `InviteByEmailFormProps`; confirm typecheck RED (missing prop contract) then GREEN after prop is added
- Remaining test inventory:
  1. TypeScript: `ManageCollaborators` passes `onSuccess` callback with correct `SentInvitationSummary` type
  2. TypeScript: `invitations` state is `useState<InvitationSummary[]>` (union), not narrowed
  3. TypeScript: no `useEffect` referencing `initialInvitations` (manual code review — no automated test)
- Execution rule: typecheck is the RED/GREEN signal for component contracts; for behavioral invariants (no `router.refresh()` in dropdown, dropdown stays open), manual browser verification is the evidence
- Delete-and-rebuild note: `InviteByEmailForm` body is adapted in place (not rebuilt); `finally { router.refresh() }` is deleted (not adapted)
- Commands:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test:unit` (ensure no existing unit tests break)
  - `npm run test:integration` (full suite — regression)

### Phase Test Strategy

- Contract-to-test mapping: 3.1 → typecheck + manual; 3.2 → typecheck; 3.3 → typecheck + manual browser; 3.4 → typecheck
- Test levels: TypeScript type-checking (primary), manual browser verification (behavioral)
- Execution order: typecheck first (catches all type-shape regressions), then manual
- Evidence capture: `npm run typecheck` output; manual screen recording or notes at phase gate

### Phase Test Checklist (Mark Green During Implementation)

- [ ] `T1` onSuccess prop signature typechecks correctly — covers 3.1, command: `npm run typecheck`
- [ ] `T2` invitations state is InvitationSummary[] (union) — covers 3.2, command: `npm run typecheck`
- [ ] `T3` SentInvitationSummary appended (not union) — covers 3.3, command: `npm run typecheck`
- [ ] `T4` onSuccess callback typed in ManageCollaborators — covers 3.4, command: `npm run typecheck`
- [ ] `T5` full integration suite regression — command: `npm run test:integration`
- [ ] `T6` lint passes — command: `npm run lint`

### Files

- `app/lists/_components/invite-by-email-form.tsx` — add `onSuccess?: (invitation: SentInvitationSummary) => void` prop; change failure check to `result.kind !== "success"`; replace `finally { router.refresh() }` with conditional `else { router.refresh() }`; call `onSuccess(result.invitation)` when present
- `app/lists/_components/manage-collaborators.tsx` — add `useState<InvitationSummary[]>(initialInvitations)`; pass `onSuccess` to `InviteByEmailForm`; append `SentInvitationSummary` on search-select success; clear search state on success; render `<PendingInvitationsList invitations={invitations} />`

### Phase Gate

#### Automated Verification
- [ ] Phase started from a clean working copy
- [ ] Specification exists (stage-6 Slice D, stage-7 §5–§6)
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run test:unit` passes
- [ ] `npm run test:integration` passes (full suite regression)

#### Manual Verification
- [ ] Invite via search-select → pending list updates immediately, dropdown stays open, search panel clears
- [ ] Invite via email form inside dropdown → pending list updates immediately, dropdown stays open
- [ ] Invite via email form on `/lists/collaborators` → `router.refresh()` fires (page updates), no regression
- [ ] Confirm no `useEffect` that re-syncs `initialInvitations` into state exists in the component

---

## Cross-Phase Test Notes

### Unit Contracts

- No new unit tests are introduced in this feature. Existing unit tests (`tests/unit/`) must continue to pass after each phase.

### Integration Contracts

- Phase 1a: `tests/integration/sign-in/find-or-create-account.test.ts` (new)
- Phase 1b: `tests/integration/invitations/search-invitable-users.test.ts` (new)
- Phase 2: `tests/integration/invitations/collaborator-management.test.ts` (extended), `tests/integration/invitations/service.test.ts` (extended for expiresAt)

### E2E Contracts

- Existing `tests/e2e/invitations/collaborator-management.spec.ts` — regression only; no new e2e cases added in this feature (E3b decision)

---

## Migration Notes

- No schema changes. No database migrations.
- `addCollaborator` deletion: any future reference to this symbol will fail at typecheck. There is exactly one call site today (`manage-collaborators.tsx`) and it is replaced in Phase 2.
- Existing `UsersTable` emails are not backfilled. The normalization is write-path only for new accounts.

---

## Security Review

**Status:** Clean
**Reviewed:** 2026-03-13

### Findings

| Category | Finding | Severity |
|----------|---------|----------|
| Injection | `searchInvitableUsers` uses parameterized Drizzle ORM queries; no raw SQL interpolation | None |
| Permission escalation | `inviteCollaborator` calls `assertCanManageCollaborators` before the try-catch; unauthorized callers receive a thrown error, not a `{ kind: "failure" }` that could be silently ignored | None |
| Insecure direct object reference | `addCollaborator` (the action that bypassed permission checks) is deleted entirely; the replacement requires ownership | Resolved by design |
| Auth bypass | `requireInvitationActionActorId` fallback (`inviterId` param in test mode) is gated behind `NODE_ENV=test || E2E_AUTH_ENABLED=1`; no production exposure | None |
| Email normalization | `invitedEmailNormalized = input.invitedEmail.trim().toLowerCase()` — consistent with `issueInvitation` internal normalization; no injection surface | None |
| Data leakage | `searchInvitableUsers` returns only `id, name, email` columns (same as `searchUsers`) — no sensitive fields exposed | None |

### Checklist Coverage

| Category | Applicable | Status |
|----------|-----------|--------|
| SQL injection | Yes | Clean — parameterized queries only |
| Permission checks | Yes | Clean — P1 decision enforced |
| Auth bypass | Yes | Clean — test-mode guard unchanged |
| Data exposure | Yes | Clean — minimal field selection |
| CSRF | No — Next.js server actions have built-in CSRF protection | N/A |
| XSS | No — React escapes by default; no `dangerouslySetInnerHTML` introduced | N/A |

---

## References

- Frame: `plan/unify-invite-flow/stage-1-frame.md`
- Shape: `plan/unify-invite-flow/stage-2-shape.md`
- Breadboard: `plan/unify-invite-flow/stage-3-breadboard.md`
- Draft spec: `plan/unify-invite-flow/stage-4-draft-spec.md`
- Slices: `plan/unify-invite-flow/stage-5-slices.md`
- Functional spec: `plan/unify-invite-flow/stage-6-final-spec.md`
- Technical spec: `plan/unify-invite-flow/stage-7-technical-spec.md`
- Integration test pattern: `tests/integration/invitations/collaborator-management.test.ts`
- Integration setup: `tests/setup/integration.ts`
