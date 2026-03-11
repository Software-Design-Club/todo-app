# Email Invitation System Implementation Plan

## Review Outcome
This plan replaces `2026-02-05-email-invitation-system.md` with the same scope, reorganized for maximum parallel execution. Phases are renumbered to match execution order. Wave 4 fans three independent phases into parallel jj workspaces. Contract JSDoc is the source of truth at the function and file level.

**Schema revision (2026-03-10):** Replaced "extend `list_collaborators`" with a separate `invitations` table. `list_collaborators` holds only accepted members. Delivery tracking lives as columns on `invitations` (no separate `invitation_delivery_attempts` table). Email mismatch tracking via `acceptedByEmail`/`acceptedByUserId` on `invitations`. `pending_approval` lives on `invitations` — no `list_collaborators` row until owner approves.

Ready to implement.

## Global Contract Rules
1. No production code for invitation behavior may be added or changed until the affected contract JSDoc is written above the function.
2. No changed behavior may be kept unless a single failing contract test proves the gap first.
3. Each red-green-refactor loop adds exactly one new failing test for one observable behavior.
4. A contract is not done when one test passes; keep adding one failing test at a time until the accumulated suite covers every documented output, error case, side effect, and state transition promised by that contract.
5. Tests may assert only observable behavior: inputs, outputs, documented errors, persisted state, rendered UI, redirects, and externally visible side effects.
6. Authorization contracts are capability-based. Use `user allowed to invite collaborators to this list` and `user allowed to manage collaborators for this list` instead of binding the spec to a specific role unless the role itself is the domain requirement.
7. Prefer domain types over raw primitives whenever the type system can express the business rule. When a contract introduces a new type, include a branded or discriminated type definition that makes illegal states unrepresentable.
8. If existing implementation conflicts with a newly written contract, rewrite the changed behavior from the contract instead of adapting tests to incidental behavior.
9. Define new invitation-domain types before the first contract that uses them.
10. Every function with a contract gets a `@contract` JSDoc block above it. Every file with multiple coherent contract functions gets a file-level `@module` JSDoc documenting the file's contract.

## Overview
Implement email-based collaborator invitations with secure one-time tokens, sign-in continuation, and collaborator-management controls. This covers roadmap item 5 from `plan/backlog.md`.

## Current State Analysis

### What Exists Today
- Collaborators are added only by selecting existing users and inserting directly into `list_collaborators` via `addCollaborator` (`app/lists/_actions/collaborators.ts:50`).
- Collaborators are loaded via `getCollaborators`, which inner-joins to `todo_users` and therefore only returns rows with a concrete `userId` (`app/lists/_actions/collaborators.ts:118`).
- Collaborator management UI is a dropdown panel scoped to a single list (`app/lists/_components/manage-collaborators.tsx`).
- Private list access is enforced by collaborator membership checks (`app/lists/_actions/permissions.ts:56`).
- Sign-in always redirects to `/` and cannot preserve invite continuation (`app/sign-in/_components/sign-in.tsx:23`).
- List lifecycle operations exist (archive/delete) but have no invitation lifecycle hook (`app/lists/_actions/list.ts:328`, `app/lists/_actions/list.ts:401`).
- `resend` v4.0.0 is installed but there is no email-delivery code path in `app/` or `lib/` (`package.json:35`).
- The codebase has no unit, integration, or e2e test harness configured (`package.json:6`).
- `ListCollaboratorsTable.userId` is non-nullable (`drizzle/schema.ts:60`). This remains correct — `list_collaborators` holds only accepted members with concrete user IDs.
- `createList` does not create an owner collaborator row; owners are only backfilled by script (`app/lists/_actions/list.ts:167`, `drizzle/backfillListCollaborators.ts:27`).

### Gaps Blocking Implementation
- No invitation token generation, persistence, or acceptance route exists.
- No `invitations` table exists; the invitation lifecycle has no schema.
- No test harness exists to verify any contract.
- Sign-in redirect is hardcoded to `/`, blocking invite continuation.
- Delivery tracking (provider message IDs, webhook correlation) has no schema or code.
- No mechanism to track email mismatches between invited email and sign-in email.

## Desired End State
1. Users allowed to invite collaborators to a list can send an invitation by email from the list dropdown and a dedicated cross-list management page.
2. Invitation email contains a one-time `/invite?token=...` link with expiry.
3. Logged-out recipients are redirected to sign-in and resumed back to invite acceptance.
4. Matching email accepts the invite and grants collaborator access.
5. Mismatched email enters `pending_approval`, and users allowed to manage collaborators for that list can approve or reject it.
6. Users allowed to manage collaborators can resend, revoke, and copy invite links.
7. Archive and delete invalidate open invites automatically.

## End-State Verification
- `npm run verify:env` passes.
- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm run test:unit` passes.
- `npm run test:integration` passes.
- `npm run test:e2e:smoke` passes.
- `npm run verify:all` passes as the single release gate.

## Locked Decisions
- Persist invitation lifecycle in a separate `invitations` table; `list_collaborators` holds only accepted members (no invitation columns).
- Persist delivery tracking as columns on the `invitations` table; no separate `invitation_delivery_attempts` relation.
- When an invitation is accepted, keep the invitation record with `status = 'accepted'` for audit trail. Create a `list_collaborators` row only upon acceptance (or approval of a mismatch).
- Keep strict email matching on acceptance; mismatch enters `pending_approval` on the `invitations` table. No `list_collaborators` row is created until the list owner approves.
- Track email mismatches: the `invitations` table records `acceptedByEmail` and `acceptedByUserId` when the sign-in email differs from the invited email.
- Keep the existing dropdown workflow and add a dedicated collaborator management page.
- Keep GitHub auth provider for MVP.
- Introduce an `EmailService` boundary: production uses a Resend-backed implementation; automated e2e uses a test stub so browser scenarios do not depend on live third-party delivery.
- Keep authorization contracts capability-based so the implementation can evolve without rewriting the plan.
- Integration tests use per-test transaction isolation to prevent cross-phase test data contamination.

## What We Are Not Doing
- Adding new auth providers.
- Building a full notification center.
- Adding global anti-abuse infrastructure beyond basic validation and permission checks.
- Building advanced email analytics dashboards.

## Version Control Workflow (Jujutsu)
- Before Phase 1, create the feature bookmark: `jj bookmark create codex/email-invitation-system` or move it with `jj bookmark set codex/email-invitation-system -r @`.
- After each phase, make exactly one `jj` commit with a one-sentence subject and a body recording what was implemented, what tests were added, which verification commands were run, and any notable limitations.
- Parallel phases use `jj workspace add <workspace-name>` to isolate work. Each workspace targets a new change on top of the shared prerequisite.
- When a wave's parallel workspaces all pass `verify:all` independently, merge them into the main workspace before starting the next wave. No specific merge order is required within a wave.

Checkpoint template:
```bash
jj commit \
  -m "Phase N: [one-sentence description]" \
  -m $'Implemented:\n- [specific changes]\nTests:\n- [tests added]\nVerification:\n- [commands run]\nNotes:\n- [limitations or follow-ups]'
```

## Parallel Execution Strategy

### Chunk Dependency Map

```
Wave 1 (parallel):  Chunk A (Phase 1)  ──┐
                     Chunk B (Phase 2)  ──┤
                                          ▼
Wave 2:             Chunk C (Phase 3)  ───┤
                                          ▼
Wave 3:             Chunk D (Phase 4)  ───┤
                                          ▼
Wave 4 (parallel):  Chunk E (Phase 5)  ──┐│
                     Chunk F (Phase 6)  ──┤│
                     Chunk G (Phase 7)  ──┤│
                                          ▼▼
Wave 5:             Chunk H (Phase 8)  ────┘
```

#### Chunk A: Foundation & Invariants
- Depends on: `none`
- Unblocks: Chunk C (Phase 3)
- Parallelizable with: Chunk B
- Workspace strategy: `jj workspace add phase-1-foundation`

#### Chunk B: Test Harness Bootstrap
- Depends on: `none`
- Unblocks: Chunk C (Phase 3)
- Parallelizable with: Chunk A
- Workspace strategy: `jj workspace add phase-2-test-harness`

#### Chunk C: Schema Evolution
- Depends on: Chunk A + Chunk B (both merged)
- Unblocks: Chunk D (Phase 4)
- Parallelizable with: `none`
- Workspace strategy: main workspace (after Wave 1 merge)

#### Chunk D: Invitation Issuing
- Depends on: Chunk C
- Unblocks: Chunks E, F, G (Wave 4)
- Parallelizable with: `none`
- Workspace strategy: main workspace (after Phase 3)

#### Chunk E: Delivery Response & Webhooks
- Depends on: Chunk D
- Unblocks: Chunk H (Phase 8)
- Parallelizable with: Chunks F, G
- Workspace strategy: `jj workspace add phase-5-delivery`

#### Chunk F: Acceptance & Auth Continuation
- Depends on: Chunk D
- Unblocks: Chunk H (Phase 8)
- Parallelizable with: Chunks E, G
- Workspace strategy: `jj workspace add phase-6-acceptance`

#### Chunk G: Lifecycle Hardening
- Depends on: Chunk D
- Unblocks: Chunk H (Phase 8)
- Parallelizable with: Chunks E, F
- Workspace strategy: `jj workspace add phase-7-lifecycle`

#### Chunk H: Collaborator Management UX
- Depends on: Chunks E + F + G (all merged)
- Unblocks: `none` (final phase)
- Parallelizable with: `none`
- Workspace strategy: main workspace (after Wave 4 merge)

---

## Phase 1: Foundation & Invariants

### Goal
Make owner membership and invitation environment validation explicit, testable contracts. Establish the owner-collaborator invariant that all subsequent phases depend on.

### Phase Execution Rules
- Governing specifications: Contracts 1.1 through 1.4 (inline below)
- Required context: `createList` at `app/lists/_actions/list.ts:167` does not insert an owner collaborator row. The backfill at `drizzle/backfillListCollaborators.ts:5` handles historical data but is not called during list creation.
- Dependencies / prerequisites: `none`
- Chunk dependencies: `none`
- Unblocks: Phase 3 (Schema Evolution)
- Parallelization note: Runs in parallel with Phase 2. Use `jj workspace add phase-1-foundation`.
- Relevant existing files:
  - `app/lists/_actions/list.ts` — `createList` needs owner row guarantee
  - `drizzle/backfillListCollaborators.ts` — backfill needs idempotence contract and reporting
  - `app/sign-in/_components/_actions/find-or-create-account.ts` — creates initial list without owner row
  - `drizzle/schema.ts` — `ListCollaboratorsTable` definition
- Constraints / non-goals: Do not modify the schema in this phase. Do not add invitation columns.
- Execution order: One RED-GREEN-REFACTOR loop per new contract test. Do not batch.
- Agent handoff note: This phase can execute with no knowledge of Phases 2-8. It only touches list creation, backfill, and env validation. Tests in this phase are integration tests (database required) for Contracts 1.1-1.3 and unit tests for Contract 1.4. Since the test harness may not exist yet (Phase 2 runs in parallel), this phase should install its own minimal test runner if Phase 2 has not landed, OR wait for Phase 2 to merge first if the workspace strategy requires it. The simpler path: merge Phase 2 first, then start Phase 1 tests.

### Specifications

#### Type Definitions
```ts
import type { Tagged } from "type-fest";

type ListId = List["id"];
type UserId = User["id"];
type ListTitle = List["title"];

type EmailAddress = Tagged<string, "EmailAddress">;
type NormalizedEmailAddress = Tagged<string, "NormalizedEmailAddress">;
type SafeAppPath = Tagged<`/${string}`, "SafeAppPath">;
type AppBaseUrl =
  | Tagged<`http://${string}`, "AppBaseUrl">
  | Tagged<`https://${string}`, "AppBaseUrl">;

type ResendApiKey = Tagged<string, "ResendApiKey">;
type ResendWebhookSecret = Tagged<string, "ResendWebhookSecret">;
type EmailFromAddress = Tagged<string, "EmailFromAddress">;

type CreateListInput = {
  title: ListTitle;
  creatorId: UserId;
  visibility?: ListVisibility;
};

type OwnerCollaboratorUpsertResult = "inserted" | "repaired" | "unchanged";

type InvitationEnv = {
  resendApiKey: ResendApiKey;
  emailFrom: EmailFromAddress;
  appBaseUrl: AppBaseUrl;
  resendWebhookSecret?: ResendWebhookSecret;
};
```

#### Contract 1.1: Owner collaborator invariant
```ts
/**
 * @contract upsertOwnerCollaborator
 *
 * Ensures exactly one accepted owner collaborator row exists for a (listId, ownerId) pair.
 *
 * @param input.listId - The list to ensure ownership for.
 * @param input.ownerId - The user who must be the owner.
 * @returns "inserted" if a new row was created, "repaired" if an existing row was
 *          corrected, "unchanged" if the row already existed correctly.
 *
 * @effects
 * - After return, exactly one `list_collaborators` row exists for (listId, ownerId)
 *   with role="owner".
 * - The owner row is usable by the same collaborator read path used elsewhere.
 * - Repeated calls do not create duplicate accepted owner memberships.
 * - Unrelated collaborator rows are not modified.
 *
 * @throws ListNotFoundError if listId does not identify an existing list.
 * @throws UserNotFoundError if ownerId does not identify an existing user.
 */
upsertOwnerCollaborator(input: {
  listId: ListId;
  ownerId: UserId;
}): Promise<OwnerCollaboratorUpsertResult>
```

#### Contract 1.2: List creation preserves the owner invariant
```ts
/**
 * @contract createList
 *
 * Creates a new list and guarantees the creator has an accepted owner collaborator
 * row before the caller can observe success.
 *
 * @param input - Title, creatorId, and optional visibility.
 * @returns The newly created list.
 *
 * @effects
 * - If the function returns list L, then upsertOwnerCollaborator({ listId: L.id,
 *   ownerId: L.creatorId }) has already become true before the caller observes success.
 * - The function does not report success for a newly created list whose creator
 *   lacks an owner collaborator row.
 */
createList(input: CreateListInput): Promise<List>
```

#### Contract 1.3: Historical repair is idempotent
```ts
/**
 * @contract backfillOwnerCollaborators
 *
 * Ensures every existing list has an accepted owner collaborator row for its creator.
 *
 * @returns A report of scanned, inserted, repaired, and unchanged counts.
 *
 * @effects
 * - After return, every existing list has an owner collaborator row.
 * - Running multiple times without intervening data changes does not create
 *   additional rows and does not change final database state after the first run.
 */
backfillOwnerCollaborators(): Promise<{
  scanned: number;
  inserted: number;
  repaired: number;
  unchanged: number;
}>
```

#### Contract 1.4: Invitation environment is validated before use
```ts
/**
 * @contract verifyInvitationEnv
 *
 * Validates and normalizes invitation environment configuration.
 *
 * @param env - The process environment object.
 * @returns A normalized InvitationEnv if all required settings are present and valid.
 *
 * @effects
 * - Returns a normalized configuration object iff all required invitation settings
 *   are present and syntactically valid.
 * - Rejects missing required keys by naming the missing key.
 * - Rejects invalid values by naming the offending key and reason.
 * - Accepts only http or https application base URLs.
 */
verifyInvitationEnv(env: NodeJS.ProcessEnv): InvitationEnv
```

### Contract Coverage Checklist
#### Contract 1.1 checklist
- [ ] Verifies the "inserted" outcome.
- [ ] Verifies the "repaired" outcome.
- [ ] Verifies the "unchanged" outcome.
- [ ] Verifies the owner row is visible through the collaborator read path.
- [ ] Verifies repeated calls do not create duplicate owner memberships.
- [ ] Verifies unrelated collaborator rows are not modified.
- [ ] Verifies `ListNotFoundError`.
- [ ] Verifies `UserNotFoundError`.

#### Contract 1.2 checklist
- [ ] Verifies successful `createList` is not observable before an owner collaborator row exists.
- [ ] Verifies the owner row created by `createList` is visible through the collaborator read path.

#### Contract 1.3 checklist
- [ ] Verifies every existing list is repaired to have an owner collaborator row.
- [ ] Verifies the repair report accounts for inserted work accurately.
- [ ] Verifies the repair report accounts for repaired work accurately.
- [ ] Verifies the repair report accounts for unchanged work accurately.
- [ ] Verifies repeated runs do not create extra collaborator rows.
- [ ] Verifies repeated runs do not change final database state after the first pass.

#### Contract 1.4 checklist
- [ ] Verifies normalized success output.
- [ ] Verifies each missing required key is named in the failure.
- [ ] Verifies invalid values name the offending key and reason.
- [ ] Verifies `http` base URLs are accepted.
- [ ] Verifies `https` base URLs are accepted.
- [ ] Verifies non-HTTP(S) base URLs are rejected.
- [ ] Verifies `resendWebhookSecret` remains optional.

### Specification-Driven TDD Workflow
- First test to write: Failing integration test proving `createList` does not guarantee an accepted owner collaborator row (Contract 1.2).
- Remaining contract-test inventory:
  1. Contract 1.1 "inserted" outcome
  2. Contract 1.1 "repaired" outcome
  3. Contract 1.1 "unchanged" outcome
  4. Contract 1.1 visibility through collaborator read path
  5. Contract 1.1 no duplicate owner memberships
  6. Contract 1.1 unrelated rows untouched
  7. Contract 1.1 `ListNotFoundError`
  8. Contract 1.1 `UserNotFoundError`
  9. Contract 1.2 owner row visible through read path
  10. Contract 1.3 backfill repairs missing owner rows
  11. Contract 1.3 inserted count accuracy
  12. Contract 1.3 repaired count accuracy
  13. Contract 1.3 unchanged count accuracy
  14. Contract 1.3 repeated runs create no extra rows
  15. Contract 1.3 repeated runs leave state unchanged
  16. Contract 1.4 normalized success output
  17. Contract 1.4 missing required key named
  18. Contract 1.4 invalid value names key and reason
  19. Contract 1.4 http accepted
  20. Contract 1.4 https accepted
  21. Contract 1.4 non-HTTP(S) rejected
  22. Contract 1.4 optional webhook secret
- Execution rule: Complete each test through RED, GREEN, REFACTOR before adding the next.
- Delete-and-rebuild note: `createList` (`app/lists/_actions/list.ts:167`) must be rewritten to include owner-row creation. The existing backfill script (`drizzle/backfillListCollaborators.ts`) must be rewritten to return structured reporting instead of console-logging.
- Commands: `npm run test:integration -- --grep "owner"`, `npm run typecheck`, `npm run lint`

### Files
- `app/lists/_actions/list.ts` — Add owner-row creation inside `createList`
- `drizzle/backfillListCollaborators.ts` — Rewrite for idempotent structured reporting
- `lib/invitations/env.ts` (new) — `verifyInvitationEnv`
- `.env.example` — Document required invitation env vars
- `scripts/verify-env.mjs` (new) — Runnable env verification
- `package.json` — Add `verify:env` script

### Phase Gate
#### Automated Verification
- [ ] Contract JSDoc written above each function before implementation
- [ ] Contract coverage checklist covers all outputs, errors, mutations, and side effects
- [ ] Contract tests executed one at a time, each failing for expected reason before code written
- [ ] Each targeted contract test passes before the next is added
- [ ] `npm run verify:env` passes for a valid env file
- [ ] `npm run typecheck` passes

#### Manual Verification
- [ ] `createList` in the UI creates an owner collaborator row observable in the database (no `inviteStatus` column — just userId, listId, role)
- [ ] Backfill script produces correct counts when run against existing data

---

## Phase 2: Test Harness Bootstrap

### Goal
Create stable test commands whose behavior is itself specified and verifiable before invitation work depends on them.

### Phase Execution Rules
- Governing specifications: Contracts 2.1 through 2.5 (inline below)
- Required context: No test infrastructure exists in the project (`package.json:6`). Need vitest for unit/integration and playwright for e2e.
- Dependencies / prerequisites: `none`
- Chunk dependencies: `none`
- Unblocks: Phase 3 (Schema Evolution)
- Parallelization note: Runs in parallel with Phase 1. Use `jj workspace add phase-2-test-harness`.
- Relevant existing files:
  - `package.json` — No test scripts or testing dependencies exist
  - `tsconfig.json` — TypeScript configuration for test file inclusion
- Constraints / non-goals: Do not write domain tests. Only write harness-operability smoke tests.
- Execution order: One RED-GREEN-REFACTOR loop per new contract test.
- Agent handoff note: This phase is pure infrastructure. It installs vitest, playwright, configures test commands, and writes minimal smoke tests that prove the harnesses work. No domain knowledge required. Integration tests must support per-test transaction isolation for later phases. Playwright setup should also allow later phases to plug in test-only service substitutions and multi-user fixtures without redesigning the harness.

### Specifications

#### Contract 2.1: Unit test command
```ts
/**
 * @contract npm run test:unit
 *
 * Executes the unit test suite.
 * - Exits 0 iff all unit tests pass.
 * - Exits non-zero if any unit test fails or the harness cannot start.
 * - Does not run integration or e2e suites.
 */
```

#### Contract 2.2: Integration test command
```ts
/**
 * @contract npm run test:integration
 *
 * Executes the integration test suite.
 * - Exits 0 iff all integration tests pass.
 * - Exits non-zero if any integration test fails or the harness cannot start.
 * - Provides per-test transaction isolation.
 */
```

#### Contract 2.3: E2E smoke command
```ts
/**
 * @contract npm run test:e2e:smoke
 *
 * Executes the smoke subset of the e2e suite.
 * - Exits 0 iff the smoke scenarios pass.
 * - Exits non-zero if any smoke scenario fails or the harness cannot start.
 */
```

#### Contract 2.4: Aggregate verification command
```ts
/**
 * @contract npm run verify:all
 *
 * Executes verify:env, typecheck, lint, test:unit, test:integration, and
 * test:e2e:smoke in a fixed order.
 * - Exits 0 iff every command exits 0.
 * - Exits non-zero if any prerequisite command fails.
 */
```

#### Contract 2.5: Baseline smoke coverage exists at each layer
Each of the unit, integration, and e2e layers contains at least one intentionally minimal contract test that fails when that harness is misconfigured. These tests assert harness operability only.

### Contract Coverage Checklist
#### Contract 2.1 checklist
- [ ] Verifies `npm run test:unit` exits 0 when all unit tests pass.
- [ ] Verifies `npm run test:unit` exits non-zero when a unit test fails.
- [ ] Verifies `npm run test:unit` does not run integration tests.
- [ ] Verifies `npm run test:unit` does not run e2e tests.

#### Contract 2.2 checklist
- [ ] Verifies `npm run test:integration` exits 0 when all integration tests pass.
- [ ] Verifies `npm run test:integration` exits non-zero when an integration test fails.
- [ ] Verifies per-test transaction isolation prevents cross-test data leakage.

#### Contract 2.3 checklist
- [ ] Verifies `npm run test:e2e:smoke` exits 0 when smoke scenarios pass.
- [ ] Verifies `npm run test:e2e:smoke` exits non-zero when a smoke scenario fails.

#### Contract 2.4 checklist
- [ ] Verifies `verify:all` runs commands in the fixed order.
- [ ] Verifies `verify:all` exits 0 when every prerequisite command succeeds.
- [ ] Verifies `verify:all` exits non-zero when any prerequisite command fails.

#### Contract 2.5 checklist
- [ ] Verifies the unit layer has a minimal operability test.
- [ ] Verifies the integration layer has a minimal operability test.
- [ ] Verifies the e2e layer has a minimal operability test.

### Specification-Driven TDD Workflow
- First test to write: Failing unit smoke test (`tests/unit/smoke.test.ts`).
- Remaining contract-test inventory:
  1. Integration smoke test (`tests/integration/smoke.test.ts`)
  2. E2E smoke test (`tests/e2e/smoke.spec.ts`)
  3. `verify:all` command-order assertion
  4. `verify:all` failure-propagation assertion
  5. Unit command isolation from integration
  6. Unit command isolation from e2e
  7. Integration transaction isolation test
- Execution rule: Complete each test through RED, GREEN, REFACTOR before adding the next.
- Delete-and-rebuild note: None. All files are new.
- Commands: `npm run test:unit`, `npm run test:integration`, `npm run test:e2e:smoke`, `npm run verify:all`

### Files
- `package.json` — Add test scripts and testing dependencies (vitest, playwright)
- `vitest.config.ts` (new) — Vitest configuration with project-based unit/integration split
- `playwright.config.ts` (new) — Playwright configuration for e2e
- `tests/setup/integration.ts` (new) — Per-test transaction isolation setup
- `tests/unit/smoke.test.ts` (new) — Unit harness operability test
- `tests/integration/smoke.test.ts` (new) — Integration harness operability test
- `tests/e2e/smoke.spec.ts` (new) — E2E harness operability test
- `scripts/verify-all.sh` (new) — Aggregate verification script

### Phase Gate
#### Automated Verification
- [ ] Contract coverage checklist covers all command outcomes and harness behaviors
- [ ] Contract tests executed one at a time
- [ ] `npm run test:unit` passes
- [ ] `npm run test:integration` passes
- [ ] `npm run test:e2e:smoke` passes
- [ ] `npm run verify:all` passes

#### Manual Verification
- [ ] Intentionally breaking a unit test causes `test:unit` to exit non-zero
- [ ] Intentionally breaking an integration test causes `test:integration` to exit non-zero

---

## Phase 3: Schema Evolution — Invitations Table

### Goal
Create a separate `invitations` table to manage the full invitation lifecycle independently from `list_collaborators`. The `list_collaborators` table is unchanged — it holds only accepted members. Delivery tracking lives as columns on `invitations`.

### Phase Execution Rules
- Governing specifications: Contracts 3.1 through 3.4 (inline below)
- Required context: `ListCollaboratorsTable` currently has `userId NOT NULL` and no invitation columns (`drizzle/schema.ts:54-76`). `getCollaborators` inner-joins on `userId` (`app/lists/_actions/collaborators.ts:118-134`). The `list_collaborators` table is NOT modified in this phase.
- Dependencies / prerequisites: Phase 1 (owner invariant) and Phase 2 (test harness) must both be merged.
- Chunk dependencies: Chunks A + B (Wave 1 must be complete)
- Unblocks: Phase 4 (Invitation Issuing)
- Parallelization note: `none` — sequential after Wave 1 merge.
- Relevant existing files:
  - `drizzle/schema.ts` — Add `InvitationsTable`
  - `lib/types.ts` — Domain types to extend
- Constraints / non-goals: Do not implement invitation workflows. Only create the schema and types. Do not modify `list_collaborators`. Do not add a separate `invitation_delivery_attempts` table — delivery tracking columns live on `invitations`.
- Execution order: One RED-GREEN-REFACTOR loop per new contract test.
- Agent handoff note: This phase creates the `invitations` table as a new, independent table. `list_collaborators` is untouched — `getCollaborators` continues to work as-is since it only reads accepted members (which is all `list_collaborators` contains). No backfill of `list_collaborators` is needed.

### Specifications

#### Type Definitions
```ts
type InvitationId = Tagged<number, "InvitationId">;
type InvitationSecretHash = Tagged<string, "InvitationSecretHash">;
type InvitationExpiry = Tagged<Date, "InvitationExpiry">;
type InvitationResolvedAt = Tagged<Date, "InvitationResolvedAt">;
type DeliveryAttemptedAt = Tagged<Date, "DeliveryAttemptedAt">;
type DeliveryEventType = Tagged<
  "failed" | "bounced" | "delayed" | "complained",
  "DeliveryEventType"
>;
type DeliveryError = Tagged<string, "DeliveryError">;
type ProviderMessageId = Tagged<string, "ProviderMessageId">;
type ProviderRawEventType = Tagged<string, "ProviderRawEventType">;
type ProviderEventReceivedAt = Tagged<Date, "ProviderEventReceivedAt">;

type PendingInvitationStatus = Tagged<"pending", "PendingInvitationStatus">;
type SentInvitationStatus = Tagged<"sent", "SentInvitationStatus">;
type AcceptedInvitationStatus = Tagged<"accepted", "AcceptedInvitationStatus">;
type PendingApprovalInvitationStatus = Tagged<"pending_approval", "PendingApprovalInvitationStatus">;
type RevokedInvitationStatus = Tagged<"revoked", "RevokedInvitationStatus">;
type ExpiredInvitationStatus = Tagged<"expired", "ExpiredInvitationStatus">;

type OpenInvitationStatus = PendingInvitationStatus | SentInvitationStatus;
type TerminalInvitationStatus = AcceptedInvitationStatus | RevokedInvitationStatus | ExpiredInvitationStatus;
type InvitationStatus =
  | OpenInvitationStatus
  | PendingApprovalInvitationStatus
  | TerminalInvitationStatus;

/** The invitations table row shape */
type InvitationRow = {
  id: InvitationId;
  listId: ListId;
  inviterId: UserId;
  invitedEmailNormalized: NormalizedEmailAddress;
  role: UserRole;
  status: InvitationStatus;
  secretHash: InvitationSecretHash;
  expiresAt: InvitationExpiry;

  /** Set when the invitation is accepted or enters pending_approval */
  acceptedByUserId: UserId | null;
  /** The email used to sign in when it differs from invitedEmailNormalized */
  acceptedByEmail: NormalizedEmailAddress | null;
  /** When the invitation reached a terminal or pending_approval state */
  resolvedAt: InvitationResolvedAt | null;

  /** Delivery tracking (latest attempt) */
  providerMessageId: ProviderMessageId | null;
  lastDeliveryError: DeliveryError | null;
  lastDeliveryAttemptAt: DeliveryAttemptedAt | null;

  /** Latest provider-reported delivery event */
  deliveryEventType: DeliveryEventType | null;
  providerRawEventType: ProviderRawEventType | null;
  providerEventReceivedAt: ProviderEventReceivedAt | null;

  createdAt: Date;
  updatedAt: Date;
};

/** Discriminated views for type-safe consumption */
type OpenInvitation = InvitationRow & {
  status: OpenInvitationStatus;
  acceptedByUserId: null;
  acceptedByEmail: null;
  resolvedAt: null;
};

type PendingApprovalInvitation = InvitationRow & {
  status: PendingApprovalInvitationStatus;
  acceptedByUserId: UserId;
  acceptedByEmail: NormalizedEmailAddress | null;
};

type AcceptedInvitation = InvitationRow & {
  status: AcceptedInvitationStatus;
  acceptedByUserId: UserId;
  resolvedAt: InvitationResolvedAt;
};

type TerminalInvitation = InvitationRow & {
  status: RevokedInvitationStatus | ExpiredInvitationStatus;
  resolvedAt: InvitationResolvedAt;
};

type InvitationView =
  | OpenInvitation
  | PendingApprovalInvitation
  | AcceptedInvitation
  | TerminalInvitation;
```

#### Contract 3.1: Invitations table data model
```ts
/**
 * @contract InvitationsTable
 *
 * The `invitations` table manages the full invitation lifecycle independently
 * from `list_collaborators`. Each row represents one invitation attempt.
 *
 * @invariants
 * - Rows with status="pending" or "sent" are open invitations awaiting action.
 * - Rows with status="pending_approval" have a non-null acceptedByUserId and
 *   represent an email-mismatch that needs owner approval.
 * - Rows with status="accepted" have a non-null acceptedByUserId and resolvedAt,
 *   and a corresponding `list_collaborators` row exists.
 * - Rows with status="revoked" or "expired" are terminal and cannot be accepted.
 * - `acceptedByEmail` is set when the sign-in email differs from invitedEmailNormalized.
 * - Delivery tracking columns (providerMessageId, lastDeliveryError,
 *   lastDeliveryAttemptAt, deliveryEventType, providerRawEventType,
 *   providerEventReceivedAt) record only the latest send attempt and latest
 *   provider-reported delivery event, not a history.
 */
```

#### Contract 3.2: Uniqueness constraints
```ts
/**
 * @contract Uniqueness constraints
 *
 * @invariants
 * - At most one open invitation for any (listId, invitedEmailNormalized)
 *   among open states (pending, sent).
 * - Terminal or pending_approval rows do not prevent a later new invitation
 *   for the same email and list.
 * - The existing `list_collaborators` uniqueness on (listId, userId) is preserved
 *   and enforced independently.
 */
```

#### Contract 3.3: Existing collaborator queries remain stable
```ts
/**
 * @contract getCollaborators
 *
 * Returns only accepted collaborators for a list. Unaffected by the new
 * `invitations` table since `list_collaborators` is unchanged.
 *
 * @param listId - The list to query.
 * @returns Only accepted collaborators with concrete user records.
 *
 * @effects
 * - Reads only from `list_collaborators` (no join to `invitations`).
 * - Preserves the existing assumption that returned collaborators have
 *   associated user records.
 */
getCollaborators(listId: ListId): Promise<AcceptedCollaborator[]>
```

#### Contract 3.4: Invitations table index strategy
```ts
/**
 * @contract Index strategy
 *
 * @invariants
 * - An index on (listId, status) supports the manage-collaborators UNION query.
 * - An index on (secretHash) supports token-based lookup at acceptance time.
 * - An index on (listId, invitedEmailNormalized, status) supports the
 *   single-open-invite uniqueness check during invitation issuing.
 */
```

### Contract Coverage Checklist
#### Contract 3.1 checklist
- [ ] Verifies open invitation rows can be inserted with all required fields.
- [ ] Verifies `pending_approval` rows require a non-null `acceptedByUserId`.
- [ ] Verifies `accepted` rows require a non-null `acceptedByUserId` and `resolvedAt`.
- [ ] Verifies terminal rows (revoked, expired) have a `resolvedAt`.
- [ ] Verifies `acceptedByEmail` is set when the sign-in email differs from `invitedEmailNormalized`.
- [ ] Verifies delivery tracking columns are nullable and independent of invitation status.

#### Contract 3.2 checklist
- [ ] Verifies at most one open invitation for any `(listId, invitedEmailNormalized)` among open states.
- [ ] Verifies a fresh invite can be issued after a prior invite reaches a terminal state.
- [ ] Verifies `list_collaborators` uniqueness on `(listId, userId)` is preserved.

#### Contract 3.3 checklist
- [ ] Verifies `getCollaborators` returns the same results as before the migration.
- [ ] Verifies `getCollaborators` does not read from the `invitations` table.

#### Contract 3.4 checklist
- [ ] Verifies the `(listId, status)` index exists.
- [ ] Verifies the `(secretHash)` index exists.
- [ ] Verifies the `(listId, invitedEmailNormalized, status)` index exists.

### Specification-Driven TDD Workflow
- First test to write: Failing integration test proving the `invitations` table can store an open invitation with all required fields (Contract 3.1).
- Remaining contract-test inventory:
  1. Contract 3.1 pending_approval requires acceptedByUserId
  2. Contract 3.1 accepted requires acceptedByUserId and resolvedAt
  3. Contract 3.1 acceptedByEmail tracks email mismatch
  4. Contract 3.1 delivery tracking columns are nullable
  5. Contract 3.2 duplicate open invites rejected
  6. Contract 3.2 fresh invite after terminal
  7. Contract 3.3 getCollaborators unchanged
  8. Contract 3.4 indexes exist
- Execution rule: Complete each test through RED, GREEN, REFACTOR before adding the next.
- Delete-and-rebuild note: None. The `invitations` table and its migration are entirely new. `getCollaborators` is verified to be unchanged but not rewritten.
- Commands: `npm run test:integration`, `npm run typecheck`, `npm run lint`

### Files
- `drizzle/schema.ts` — Add `InvitationsTable` (do NOT modify `ListCollaboratorsTable`)
- `drizzle/*.sql` (new migration)
- `drizzle/meta/*` (generated)
- `lib/types.ts` — Add invitation types
- `tests/integration/invitations/schema-migration.test.ts` (new)

### Phase Gate
#### Automated Verification
- [ ] Contract JSDoc written above each function before implementation
- [ ] Contract coverage checklist fully checked
- [ ] Contract tests executed one at a time
- [ ] `npm run test:integration` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes

#### Manual Verification
- [ ] Existing list pages still render collaborators correctly after migration (no regression)
- [ ] The `invitations` table exists with all expected columns and indexes

---

## Phase 4: Invitation Issuing & Send Attempt Workflow

### Goal
Define the end-to-end workflow for inviting someone to a list up to the point where Resend returns its immediate send response. This phase creates the shared files (`lib/invitations/service.ts`, `app/lists/_actions/invitations.ts`) that Wave 4 phases will extend. All invitation state is written to the `invitations` table; `list_collaborators` is not touched.

### Phase Execution Rules
- Governing specifications: Contracts 4.1 through 4.7 (inline below)
- Required context: Phase 3 `invitations` table must be in place. `resend` v4.0.0 is already installed (`package.json:35`). Env vars `RESEND_API_KEY`, `EMAIL_FROM`, `APP_BASE_URL` are configured.
- Dependencies / prerequisites: Phase 3 (Schema Evolution) must be complete.
- Chunk dependencies: Chunk C (Phase 3)
- Unblocks: Chunks E, F, G (Phases 5, 6, 7 — Wave 4)
- Parallelization note: `none` — sequential. After this phase, three workspaces fan out.
- Relevant existing files:
  - `app/lists/_actions/permissions.ts` — Permission model to extend
  - `drizzle/schema.ts` — `InvitationsTable` from Phase 3
  - `lib/types.ts` — Domain types
- Constraints / non-goals: Do not leak provider-specific send-response types beyond the `EmailService` boundary. Do not implement acceptance. Do not implement webhook handling. Do not write to `list_collaborators`.
- Execution order: One RED-GREEN-REFACTOR loop per new contract test.
- Agent handoff note: This phase creates `lib/invitations/service.ts` and `app/lists/_actions/invitations.ts` as the base files. Wave 4 phases will ADD functions to these files. The service file must be structured for extension (exported functions, not a class).

### Specifications

#### Type Definitions
```ts
type InvitationSecret = Tagged<string, "InvitationSecret">;
type AbsoluteInvitationUrl =
  | Tagged<`http://${string}`, "AbsoluteInvitationUrl">
  | Tagged<`https://${string}`, "AbsoluteInvitationUrl">;

type EmailServiceErrorMessage = Tagged<string, "EmailServiceErrorMessage">;
type EmailServiceErrorName = Tagged<string, "EmailServiceErrorName">;

type EmailServiceAcceptedSendResponse = {
  kind: "accepted";
  providerMessageId: ProviderMessageId;
};

type EmailServiceRejectedSendResponse = {
  kind: "rejected";
  errorMessage: EmailServiceErrorMessage;
  errorName?: EmailServiceErrorName;
};

type EmailServiceSendResponse =
  | EmailServiceAcceptedSendResponse
  | EmailServiceRejectedSendResponse;

type PersistedSentInvitation = {
  invitationId: InvitationId;
  status: SentInvitationStatus;
  expiresAt: InvitationExpiry;
  wasRotated: boolean;
};

type EmailService = {
  sendInvitationEmail(input: {
    invitationId: InvitationId;
    acceptanceUrl: AbsoluteInvitationUrl;
  }): Promise<EmailServiceSendResponse>;
};

type InviteCollaboratorWorkflowResult = {
  invitationId: InvitationId;
  acceptanceUrl: AbsoluteInvitationUrl;
  emailServiceResponse: EmailServiceSendResponse;
};
```

#### Contract 4.1: Invite collaborator workflow
```ts
/**
 * @contract inviteCollaboratorWorkflow
 *
 * End-to-end workflow for inviting someone to a list by email.
 *
 * @param input.listId - The list to invite to.
 * @param input.inviterId - The user sending the invitation.
 * @param input.invitedEmail - The email to invite.
 * @param input.now - Current timestamp for expiry calculation.
 * @returns The invitation ID, acceptance URL, and generic email-service response.
 *
 * @effects
 * - Requires inviterId to be allowed to invite collaborators to listId.
 * - After return, exactly one open invitation row exists in `invitations` for
 *   (listId, invitedEmailNormalized).
 * - The persisted invitation contains hashed secret, expiry, inviter id, normalized
 *   email, and status="sent".
 * - The returned acceptance URL contains the one-time secret matching the persisted hash.
 * - Attempts exactly one email send per invocation.
 * - Returns the generic email-service send response for later interpretation.
 * - If an open invite already existed, previously issued secrets become unusable
 *   and the returned secret becomes authoritative.
 *
 * @throws InvitationPermissionDeniedError if inviterId is not allowed to invite.
 * @throws ListNotFoundError if listId does not exist.
 */
inviteCollaboratorWorkflow(input: {
  listId: ListId;
  inviterId: UserId;
  invitedEmail: EmailAddress;
  now: Date;
}): Promise<InviteCollaboratorWorkflowResult>
```

### Step Specifications

#### Contract 4.2: Invitation permission check
```ts
/**
 * @contract assertCanInviteCollaborators
 *
 * Returns successfully iff actorId is allowed to invite collaborators to listId.
 * Does not mutate invitation or collaborator state.
 *
 * @throws InvitationPermissionDeniedError if not allowed.
 */
assertCanInviteCollaborators(input: {
  listId: ListId;
  actorId: UserId;
}): Promise<void>
```

#### Contract 4.3: Invitation secret creation
```ts
/**
 * @contract createInvitationSecret
 *
 * Returns a non-empty opaque secret suitable for use in an invitation URL.
 * The caller can treat it as one-time bearer material.
 */
createInvitationSecret(): InvitationSecret
```

#### Contract 4.4: Invitation secret hashing
```ts
/**
 * @contract hashInvitationSecret
 *
 * Deterministic: equal secrets produce equal hashes.
 * Stable across a single deployment for persisted lookup behavior.
 */
hashInvitationSecret(secret: InvitationSecret): InvitationSecretHash
```

#### Contract 4.5: Persist or rotate a single open invite
```ts
/**
 * @contract issueInvitation
 *
 * Persists exactly one open invitation row in the `invitations` table for
 * (listId, invitedEmailNormalized). If an open invitation already existed,
 * rotation invalidates the prior secret while preserving the single-open-invite
 * invariant. Does not send email. Does not write to `list_collaborators`.
 */
issueInvitation(input: {
  listId: ListId;
  inviterId: UserId;
  invitedEmail: EmailAddress;
  secretHash: InvitationSecretHash;
  now: Date;
}): Promise<PersistedSentInvitation>
```

#### Contract 4.6: Invitation URL construction
```ts
/**
 * @contract buildInvitationAcceptanceUrl
 *
 * Returns the canonical app URL for /invite?token=...
 * Uses the configured base URL and does not emit a relative URL.
 */
buildInvitationAcceptanceUrl(input: {
  appBaseUrl: AppBaseUrl;
  secret: InvitationSecret;
}): AbsoluteInvitationUrl
```

#### Contract 4.7: Email service send attempt
```ts
/**
 * @contract sendInvitationEmail
 *
 * Validates required email configuration before attempting provider delivery.
 * Delegates to the configured `EmailService` implementation.
 * Attempts exactly one service send per invocation.
 * Production uses a Resend-backed `EmailService`, which maps provider-specific
 * send responses into `EmailServiceSendResponse` before returning.
 * E2E uses a test-stub `EmailService` that captures invitation deliveries for
 * deterministic browser tests without depending on live provider delivery.
 * Returns the generic `EmailServiceSendResponse`; downstream invitation code
 * does not depend on provider-specific response shapes.
 */
sendInvitationEmail(input: {
  invitationId: InvitationId;
  acceptanceUrl: AbsoluteInvitationUrl;
}): Promise<EmailServiceSendResponse>
```

### Contract Coverage Checklist
#### Contract 4.1 checklist
- [ ] Verifies `InvitationPermissionDeniedError`.
- [ ] Verifies `ListNotFoundError`.
- [ ] Verifies exactly one open invite exists after success.
- [ ] Verifies persisted invite stores the hashed secret.
- [ ] Verifies persisted invite stores the expiry.
- [ ] Verifies persisted invite stores the inviter id.
- [ ] Verifies persisted invite stores the normalized email.
- [ ] Verifies persisted invitation stores `status = "sent"` in the `invitations` table.
- [ ] Verifies the returned acceptance URL uses the authoritative secret.
- [ ] Verifies exactly one email send per invocation.
- [ ] Verifies the generic email-service response is returned unchanged.
- [ ] Verifies rotating an existing open invite makes the prior secret unusable.
- [ ] Verifies rotating an existing open invite makes the returned secret authoritative.

#### Contract 4.2 checklist
- [ ] Verifies allowed actors pass.
- [ ] Verifies denied actors raise `InvitationPermissionDeniedError`.
- [ ] Verifies the check does not mutate collaborator state.
- [ ] Verifies the check does not mutate invitation state.

#### Contract 4.3 checklist
- [ ] Verifies the generated secret is non-empty.
- [ ] Verifies the caller receives opaque bearer material.

#### Contract 4.4 checklist
- [ ] Verifies equal secrets hash identically.
- [ ] Verifies persisted lookup behavior remains stable.

#### Contract 4.5 checklist
- [ ] Verifies first-time invite persistence.
- [ ] Verifies the single-open-invite invariant.
- [ ] Verifies rotation replaces the authoritative secret.
- [ ] Verifies issuing does not send email.
- [ ] Verifies issuing/rotation preserves the allowed open-invitation transition shape without creating a second open row.

#### Contract 4.6 checklist
- [ ] Verifies the canonical `/invite?token=...` URL is produced.
- [ ] Verifies the URL is absolute and based on the configured base URL.

#### Contract 4.7 checklist
- [ ] Verifies required email configuration is validated before delivery.
- [ ] Verifies exactly one configured `EmailService` send attempt per invocation.
- [ ] Verifies the configured `EmailService` boundary can be swapped for a test stub in e2e.
- [ ] Verifies a successful `EmailServiceSendResponse` is returned unchanged.
- [ ] Verifies a failed `EmailServiceSendResponse` is returned unchanged.

### Specification-Driven TDD Workflow
- First test to write: Failing unit test proving an unauthorized actor is rejected (Contract 4.2).
- Remaining contract-test inventory:
  1. Contract 4.3 secret non-empty
  2. Contract 4.4 equal secrets hash identically
  3. Contract 4.5 first-time persistence
  4. Contract 4.5 rotation
  5. Contract 4.5 state-transition shape for issue vs rotation
  6. Contract 4.6 canonical URL
  7. Contract 4.7 configured `EmailService` invoked exactly once
  8. Contract 4.7 successful email-service response
  9. Contract 4.7 failed email-service response
  10. Contract 4.1 happy-path integration (success + URL + response)
  11. Contract 4.1 failed-send integration
  12. Remaining checklist items one at a time
- Execution rule: Complete each test through RED, GREEN, REFACTOR before adding the next.
- Delete-and-rebuild note: None. All files are new.
- Commands: `npm run test:unit`, `npm run test:integration`, `npm run typecheck`, `npm run lint`

### Files
- `lib/invitations/token.ts` (new) — `createInvitationSecret`, `hashInvitationSecret`
- `lib/invitations/service.ts` (new) — `issueInvitation`, `inviteCollaboratorWorkflow`
- `lib/invitations/errors.ts` (new) — Domain error types
- `app/lists/_actions/invitations.ts` (new) — Server action wrappers
- `app/lists/_actions/permissions.ts` — Add `assertCanInviteCollaborators`
- `lib/email/service.ts` (new) — `EmailService` contract and implementation selection
- `lib/email/resend.ts` (new) — production Resend-backed `EmailService`
- `lib/email/test-stub.ts` (new) — test-stub `EmailService` for Playwright
- `app/emails/invitation-email.tsx` (new) — React Email template
- `tests/e2e/support/invitation-mailbox.ts` (new) — Playwright helper for reading stubbed invite deliveries
- `tests/unit/invitations/*.test.ts` (new)
- `tests/integration/invitations/service.test.ts` (new)

### Phase Gate
#### Automated Verification
- [ ] Contract JSDoc written above each function before implementation
- [ ] Contract coverage checklist fully checked
- [ ] Contract tests executed one at a time
- [ ] `npm run test:unit` passes
- [ ] `npm run test:integration` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes

#### Manual Verification
- [ ] Sending an invitation from a test script delivers an email to Resend's test inbox

---

## Phase 5: Delivery Response & Webhook Authentication Workflow

### Goal
Interpret generic `EmailService` send responses, persist delivery outcomes as columns on the `invitations` table, and consume authenticated provider delivery events after the Resend adapter verifies and normalizes webhook payloads.

### Phase Execution Rules
- Governing specifications: Contracts 5.1 through 5.7 (inline below)
- Required context: The production Resend adapter maps provider-specific send responses into `EmailServiceSendResponse` at the `EmailService` boundary and maps verified Resend webhook payloads into generic `EmailServiceDeliveryEvent` values. Resend webhook auth uses raw body + svix-id/timestamp/signature headers + signing secret. Delivery tracking lives as columns on the `invitations` table (providerMessageId, lastDeliveryError, lastDeliveryAttemptAt, deliveryEventType, providerRawEventType, providerEventReceivedAt).
- Dependencies / prerequisites: Phase 4 (Invitation Issuing) must be complete.
- Chunk dependencies: Chunk D (Phase 4)
- Unblocks: Chunk H (Phase 8 — Collaborator Management)
- Parallelization note: Runs in parallel with Phases 6 and 7. Use `jj workspace add phase-5-delivery`. Adds functions to `lib/invitations/service.ts` and `app/lists/_actions/invitations.ts` — no functional overlap with Phases 6 or 7. This phase writes only delivery-tracking columns on `invitations` (providerMessageId, lastDeliveryError, lastDeliveryAttemptAt, deliveryEventType, providerRawEventType, providerEventReceivedAt). Phase 6 writes `status`, `acceptedByUserId`, `acceptedByEmail`, and `list_collaborators`. Phase 7 writes `status` and `resolvedAt`. No column-level write overlap.
- Relevant existing files:
  - `lib/invitations/service.ts` — Add delivery response handlers (created in Phase 4)
  - `lib/email/resend.ts` — Add Resend webhook verification and mapping to generic delivery events (created in Phase 4)
  - `drizzle/schema.ts` — `InvitationsTable` delivery columns (created in Phase 3)
- Constraints / non-goals: Do not accept, revoke, or otherwise change invitation status. Only update delivery-tracking columns. Do not write to `list_collaborators`.
- Execution order: One RED-GREEN-REFACTOR loop per new contract test.
- Agent handoff note: This phase only touches delivery-tracking columns on the `invitations` table. It does NOT modify `status`, `acceptedByUserId`, `acceptedByEmail`, `resolvedAt`, or `list_collaborators`. This column-level isolation is what makes it safe to run in parallel with Phases 6 and 7.

### Specifications

#### Type Definitions
```ts
type ResendWebhookHeaders = {
  "svix-id": Tagged<string, "ResendSvixId">;
  "svix-timestamp": Tagged<string, "ResendSvixTimestamp">;
  "svix-signature": Tagged<string, "ResendSvixSignature">;
};

type VerifiedResendWebhookPayload = {
  type: Tagged<string, "ResendWebhookEventType">;
  data: { email_id?: ProviderMessageId | null };
};

type InvitationDeliveryResult =
  | { kind: "accepted_for_delivery"; providerMessageId: ProviderMessageId }
  | {
      kind: "send_failed";
      providerErrorMessage: EmailServiceErrorMessage;
      providerErrorName?: EmailServiceErrorName;
    };

type SupportedEmailServiceDeliveryEvent = {
  kind: "delivery_reported";
  deliveryEventType: DeliveryEventType;
  providerMessageId: ProviderMessageId;
  providerRawEventType: ProviderRawEventType;
  receivedAt: ProviderEventReceivedAt;
};

type IgnoredEmailServiceDeliveryEvent = {
  kind: "ignored";
  providerRawEventType: ProviderRawEventType;
  providerMessageId?: ProviderMessageId | null;
  receivedAt: ProviderEventReceivedAt;
};

type EmailServiceDeliveryEvent =
  | SupportedEmailServiceDeliveryEvent
  | IgnoredEmailServiceDeliveryEvent;

type AuthenticatedDeliveryEventResult = {
  deliveryEventType: DeliveryEventType | null;
  providerRawEventType: ProviderRawEventType;
  persistence: "updated" | "ignored";
};
```

#### Contract 5.1: Immediate email service response handling workflow
```ts
/**
 * @contract handleInvitationSendResponseWorkflow
 *
 * Interprets the generic `EmailServiceSendResponse` and persists the delivery outcome.
 *
 * @effects
 * - If the response kind is "accepted", updates delivery-tracking columns
 *   on the `invitations` row for invitationId (providerMessageId, lastDeliveryAttemptAt).
 * - If the response kind is "rejected", updates failure columns on the `invitations` row
 *   (lastDeliveryError, lastDeliveryAttemptAt).
 * - Does not modify invitation status, acceptedByUserId, acceptedByEmail,
 *   resolvedAt, or `list_collaborators`.
 */
handleInvitationSendResponseWorkflow(input: {
  invitationId: InvitationId;
  emailServiceResponse: EmailServiceSendResponse;
  attemptedAt: DeliveryAttemptedAt;
}): Promise<InvitationDeliveryResult>
```

#### Contract 5.2: Authenticated provider delivery-event workflow
```ts
/**
 * @contract handleAuthenticatedEmailProviderEventWorkflow
 *
 * Persists an already-authenticated provider delivery event produced by the
 * `EmailService` boundary.
 *
 * @effects
 * - Accepts supported events and updates delivery-tracking columns on the
 *   `invitations` row when correlatable to a previously recorded provider message id.
 * - Stores canonical `deliveryEventType` values so invitation-domain behavior is
 *   consistent across providers.
 * - Preserves the provider's raw event name in `providerRawEventType` for audit/debugging.
 * - Returns "ignored" for authenticated but uncorrelatable or unsupported events.
 */
handleAuthenticatedEmailProviderEventWorkflow(input: {
  deliveryEvent: EmailServiceDeliveryEvent;
}): Promise<AuthenticatedDeliveryEventResult>
```

### Step Specifications

#### Contract 5.3: Email service send-response normalization
```ts
/**
 * @contract normalizeEmailServiceSendResponse
 *
 * Maps `EmailServiceSendResponse` into the invitation delivery-domain result.
 * The invitation domain remains provider-agnostic; provider-specific response
 * mapping must already have occurred inside the `EmailService` implementation.
 */
normalizeEmailServiceSendResponse(response: EmailServiceSendResponse): InvitationDeliveryResult
```

#### Contract 5.4: Invitation delivery-attempt persistence
```ts
/**
 * @contract recordInvitationSendResult
 *
 * Updates the delivery-tracking columns on the `invitations` row for invitationId.
 * Stores provider message id for later delivery-event correlation when accepted for delivery.
 * Stores provider failure details when send failed immediately.
 */
recordInvitationSendResult(input: {
  invitationId: InvitationId;
  result: InvitationDeliveryResult;
  attemptedAt: DeliveryAttemptedAt;
}): Promise<void>
```

#### Contract 5.5: Resend webhook signature verification
```ts
/**
 * @contract verifyResendWebhookSignature
 *
 * Verifies the webhook signature using raw body and svix-* headers.
 * Returns the verified event payload on success.
 *
 * @throws InvalidWebhookSignatureError if signature is missing or invalid.
 */
verifyResendWebhookSignature(input: {
  rawBody: string;
  headers: ResendWebhookHeaders;
  signingSecret: ResendWebhookSecret;
}): VerifiedResendWebhookPayload
```

#### Contract 5.6: Webhook delivery-event persistence
```ts
/**
 * @contract recordInvitationDeliveryEvent
 *
 * Updates delivery-tracking columns on the `invitations` row when correlatable
 * through provider message id.
 * Stores canonical `deliveryEventType` values and the provider's raw event name.
 * Returns "ignored" for authenticated but uncorrelatable or unsupported events.
 */
recordInvitationDeliveryEvent(input: {
  event: EmailServiceDeliveryEvent;
}): Promise<"updated" | "ignored">
```

#### Contract 5.7: Webhook route behavior
```ts
/**
 * @contract handleResendWebhookRequest
 *
 * Reads the raw request body without destroying signature verification ability.
 * Uses Contract 5.5 before any delivery mutation occurs.
 * Maps the verified Resend payload into `EmailServiceDeliveryEvent` before invoking
 * invitation-domain delivery persistence.
 * Returns a non-success response for invalid signatures and malformed payloads.
 */
handleResendWebhookRequest(request: Request): Promise<Response>
```

### Contract Coverage Checklist
#### Contract 5.1 checklist
- [ ] Verifies accepted-for-delivery response is normalized correctly.
- [ ] Verifies accepted-for-delivery response updates delivery columns on the `invitations` row.
- [ ] Verifies send-failed response is normalized correctly.
- [ ] Verifies send-failed response updates delivery columns on the `invitations` row.
- [ ] Verifies immediate response handling does not mutate invitation status or `list_collaborators`.

#### Contract 5.2 checklist
- [ ] Verifies supported authenticated delivery events are persisted.
- [ ] Verifies canonical `deliveryEventType` values are stored consistently across providers.
- [ ] Verifies authenticated but uncorrelatable events return "ignored".

#### Contract 5.3 checklist
- [ ] Verifies successful normalization of `EmailServiceAcceptedSendResponse`.
- [ ] Verifies failed normalization of `EmailServiceRejectedSendResponse`.
- [ ] Verifies invitation-domain code consumes only `EmailServiceSendResponse`, not provider-specific response shapes.

#### Contract 5.4 checklist
- [ ] Verifies provider message ids are stored on the `invitations` row for accepted-for-delivery results.
- [ ] Verifies provider failure details are stored on the `invitations` row for immediate send failures.

#### Contract 5.5 checklist
- [ ] Verifies successful signature verification returns the event payload.
- [ ] Verifies missing signature material raises `InvalidWebhookSignatureError`.
- [ ] Verifies invalid signature material raises `InvalidWebhookSignatureError`.

#### Contract 5.6 checklist
- [ ] Verifies `failed` delivery events update delivery columns when correlatable.
- [ ] Verifies `bounced` delivery events update delivery columns when correlatable.
- [ ] Verifies `delayed` delivery events update delivery columns when correlatable.
- [ ] Verifies `complained` delivery events update delivery columns when correlatable.
- [ ] Verifies raw provider event names are stored alongside canonical delivery event types.
- [ ] Verifies unsupported authenticated events return "ignored".
- [ ] Verifies uncorrelatable authenticated events return "ignored".

#### Contract 5.7 checklist
- [ ] Verifies the route reads raw body preserving signature verification.
- [ ] Verifies signature verification occurs before any delivery mutation.
- [ ] Verifies the route maps verified Resend payloads into `EmailServiceDeliveryEvent`.
- [ ] Verifies invalid signatures return a non-success response.
- [ ] Verifies malformed payloads return a non-success response.

### Specification-Driven TDD Workflow
- First test to write: Failing unit test proving a successful `EmailServiceAcceptedSendResponse` normalizes to `accepted_for_delivery` (Contract 5.3).
- Remaining contract-test inventory:
  1. Contract 5.3 failure normalization
  2. Contract 5.3 provider-agnostic boundary verification
  3. Contract 5.4 provider message id persistence
  4. Contract 5.4 failure detail persistence
  5. Contract 5.1 accepted-for-delivery integration
  6. Contract 5.1 send-failed integration
  7. Contract 5.1 does not mutate recipient state
  8. Contract 5.5 invalid signature rejection
  9. Contract 5.5 successful verification
  10. Contract 5.6 bounced canonical-event persistence
  11. Contract 5.6 remaining canonical event types + raw provider type storage
  12. Contract 5.6 unsupported/uncorrelatable ignored
  13. Contract 5.2 + 5.7 authenticated webhook integration through the EmailService boundary
  14. Contract 5.7 raw body preservation
- Execution rule: Complete each test through RED, GREEN, REFACTOR before adding the next.
- Delete-and-rebuild note: None. All files are new or extended.
- Commands: `npm run test:unit`, `npm run test:integration`, `npm run typecheck`, `npm run lint`

### Files
- `lib/email/resend.ts` — Add Resend webhook verification plus mapping to `EmailServiceSendResponse` and `EmailServiceDeliveryEvent`
- `lib/invitations/service.ts` — Add `handleInvitationSendResponseWorkflow`, generic delivery-event handling, and delivery persistence
- `app/api/webhooks/resend/route.ts` (new) — Webhook route handler
- `app/lists/_actions/invitations.ts` — Add delivery workflow server action
- `tests/unit/invitations/email-provider-response.test.ts` (new)
- `tests/unit/email/resend-webhook.test.ts` (new)
- `tests/integration/invitations/delivery-response.test.ts` (new)

### Phase Gate
#### Automated Verification
- [ ] Contract JSDoc written above each function before implementation
- [ ] Contract coverage checklist fully checked
- [ ] Contract tests executed one at a time
- [ ] `npm run test:unit` passes
- [ ] `npm run test:integration` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes

#### Manual Verification
- [ ] Webhook route returns 401 for unsigned requests (testable via curl)

---

## Phase 6: Invitation Acceptance & Auth Continuation Workflow

### Goal
Define the end-to-end workflow for consuming an invite link across logged-out, matched-email, mismatched-email, and terminal invite states. Acceptance creates a `list_collaborators` row atomically with updating the invitation. Email mismatches enter `pending_approval` without creating a collaborator row, and the mismatch is tracked.

### Phase Execution Rules
- Governing specifications: Contracts 6.1 through 6.5 (inline below)
- Required context: Sign-in currently hardcodes redirect to `/` (`app/sign-in/_components/sign-in.tsx:23`). Invite acceptance must preserve the token across the sign-in redirect.
- Dependencies / prerequisites: Phase 4 (Invitation Issuing) must be complete.
- Chunk dependencies: Chunk D (Phase 4)
- Unblocks: Chunk H (Phase 8 — Collaborator Management)
- Parallelization note: Runs in parallel with Phases 5 and 7. Use `jj workspace add phase-6-acceptance`. Writes `status` (`accepted`, `pending_approval`), `acceptedByUserId`, `acceptedByEmail`, and `resolvedAt` on `invitations`. Creates `list_collaborators` rows on acceptance. No column-level overlap with Phase 5 (delivery-tracking columns only) or Phase 7 (writes `status` to `revoked`/`expired` — mutually exclusive values).
- Relevant existing files:
  - `app/sign-in/_components/sign-in.tsx` — Redirect must support continuation
  - `app/sign-in/page.tsx` — May need to accept `redirectTo` param
  - `lib/invitations/service.ts` — Add acceptance functions (created in Phase 4)
  - `app/lists/_actions/invitations.ts` — Add acceptance server actions (created in Phase 4)
- Constraints / non-goals: Do not implement resend, revoke, approve, or reject actions. Only accept or transition to pending_approval.
- Execution order: One RED-GREEN-REFACTOR loop per new contract test.
- Agent handoff note: This phase writes `status` to `accepted` or `pending_approval` on `invitations` and creates `list_collaborators` rows for accepted invitations. It does NOT write `revoked` or `expired` (that's Phase 7). It does NOT touch delivery-tracking columns (that's Phase 5). On email mismatch, `acceptedByEmail` and `acceptedByUserId` are set on the `invitations` row but no `list_collaborators` row is created until owner approval (Phase 8). The sign-in continuation flow requires modifying the existing `signIn("github", { redirectTo })` call to accept a dynamic redirect.

### Specifications

#### Type Definitions
```ts
type AuthenticatedUser = Pick<User, "id" | "email" | "name">;

type AcceptedInvitationResolution = { kind: "accepted"; listId: ListId };
type PendingApprovalInvitationResolution = { kind: "pending_approval"; listId: ListId };
type TerminalInvitationResolution =
  | { kind: "invalid" }
  | { kind: "expired" }
  | { kind: "revoked" }
  | { kind: "already_resolved" };

type ResolveInviteAcceptanceResult =
  | AcceptedInvitationResolution
  | PendingApprovalInvitationResolution
  | TerminalInvitationResolution;

type AcceptInvitationWorkflowResult =
  | { kind: "redirect_to_sign_in"; redirectTo: SafeAppPath }
  | ResolveInviteAcceptanceResult;

type InvitePageOutcome = Exclude<
  ResolveInviteAcceptanceResult,
  AcceptedInvitationResolution
>;
```

#### Contract 6.1: Accept invitation workflow
```ts
/**
 * @contract acceptInvitationWorkflow
 *
 * End-to-end workflow for consuming an invite link.
 *
 * @effects
 * - If the secret does not identify an open invitation, returns the correct
 *   terminal outcome without mutating unrelated invitations.
 * - If the invitation is open and viewer is null, returns redirect_to_sign_in
 *   with a safe path that resumes the same invite URL after sign-in.
 * - If the invitation is open and viewer.email matches, accepts the invitation
 *   atomically: updates `invitations.status` to 'accepted', sets `acceptedByUserId`,
 *   sets `resolvedAt`, and inserts a `list_collaborators` row. Collaborator access
 *   is observable immediately.
 * - If the invitation is open and viewer.email does not match, updates
 *   `invitations.status` to 'pending_approval', sets `acceptedByUserId` and
 *   `acceptedByEmail` to record the mismatch. Does NOT create a `list_collaborators`
 *   row — the owner must approve first (Phase 8).
 * - Reusing a consumed, revoked, or expired secret does not create a second acceptance.
 */
acceptInvitationWorkflow(input: {
  invitationSecret: InvitationSecret;
  viewer: AuthenticatedUser | null;
  now: Date;
}): Promise<AcceptInvitationWorkflowResult>
```

### Step Specifications

#### Contract 6.2: Safe redirect target normalization
```ts
/**
 * @contract normalizeRedirectTarget
 *
 * Returns a safe app-relative path when value names an internal path.
 * Rejects absolute URLs, cross-origin targets, and malformed redirect targets
 * by returning the default safe path.
 * Prevents invite continuation from introducing an open redirect.
 */
normalizeRedirectTarget(value: string | null): SafeAppPath
```

#### Contract 6.3: Sign-in continuation target creation
```ts
/**
 * @contract buildInviteContinuationTarget
 *
 * Returns the safe app-relative invite URL needed to resume the same invitation
 * after sign-in. Does not emit cross-origin or absolute URLs.
 */
buildInviteContinuationTarget(secret: InvitationSecret): SafeAppPath
```

#### Contract 6.4: Invitation resolution
```ts
/**
 * @contract resolveInviteAcceptance
 *
 * Resolves an invitation based on the viewer's email and the invitation's state.
 *
 * @effects
 * - On exact email match: updates `invitations.status` to 'accepted', sets
 *   `acceptedByUserId` and `resolvedAt`, inserts a `list_collaborators` row
 *   atomically.
 * - On email mismatch: updates `invitations.status` to 'pending_approval',
 *   sets `acceptedByUserId` and `acceptedByEmail` to track the mismatch.
 *   Does NOT create a `list_collaborators` row.
 * - Returns the correct terminal outcome for invalid, expired, revoked, or
 *   already resolved invitations.
 */
resolveInviteAcceptance(input: {
  invitationSecret: InvitationSecret;
  viewer: AuthenticatedUser;
  now: Date;
}): Promise<ResolveInviteAcceptanceResult>
```

#### Contract 6.5: Invite page outcome rendering
```ts
/**
 * @contract Invite page rendering
 *
 * /invite?token=... renders an explicit user-facing state for every InvitePageOutcome:
 * invalid, expired, revoked, already_resolved, and pending_approval.
 * The page does not silently redirect away from those terminal states.
 */
```

### Contract Coverage Checklist
#### Contract 6.1 checklist
- [ ] Verifies invalid secrets return the correct terminal outcome.
- [ ] Verifies invalid-secret handling does not mutate unrelated invitations.
- [ ] Verifies logged-out viewers receive a sign-in redirect with safe continuation target.
- [ ] Verifies matching-email viewers accept the invitation successfully (status='accepted', acceptedByUserId set, resolvedAt set).
- [ ] Verifies matching-email acceptance creates a `list_collaborators` row atomically.
- [ ] Verifies matching-email acceptance makes collaborator access observable immediately.
- [ ] Verifies mismatched-email viewers transition invitation to `pending_approval`.
- [ ] Verifies mismatched-email sets `acceptedByEmail` to the actual sign-in email.
- [ ] Verifies mismatched-email sets `acceptedByUserId` to the viewer's user id.
- [ ] Verifies mismatched-email does NOT create a `list_collaborators` row.
- [ ] Verifies reused consumed secrets do not create a second acceptance.
- [ ] Verifies reused revoked secrets do not create a second acceptance.
- [ ] Verifies reused expired secrets do not create a second acceptance.

#### Contract 6.2 checklist
- [ ] Verifies safe internal app-relative paths are accepted.
- [ ] Verifies absolute redirect targets fall back to the default safe path.
- [ ] Verifies cross-origin redirect targets fall back to the default safe path.
- [ ] Verifies malformed redirect targets fall back to the default safe path.

#### Contract 6.3 checklist
- [ ] Verifies continuation targets preserve the same invite token path.
- [ ] Verifies continuation targets do not emit absolute URLs.
- [ ] Verifies continuation targets do not emit cross-origin URLs.

#### Contract 6.4 checklist
- [ ] Verifies the `accepted` outcome (invitation status + list_collaborators row + acceptedByUserId + resolvedAt).
- [ ] Verifies the `pending_approval` outcome (invitation status + acceptedByUserId + acceptedByEmail, no list_collaborators row).
- [ ] Verifies the allowed transition from open invitation to `accepted`.
- [ ] Verifies the allowed transition from open invitation to `pending_approval`.
- [ ] Verifies the `invalid` outcome.
- [ ] Verifies the `expired` outcome.
- [ ] Verifies the `revoked` outcome.
- [ ] Verifies the `already_resolved` outcome.
- [ ] Verifies non-open invitations do not transition again through acceptance.
- [ ] Verifies a zero-row conditional acceptance update returns the correct terminal outcome.
- [ ] Verifies acceptance loses a race to archive and creates no `list_collaborators` row.
- [ ] Verifies acceptance loses a race to delete and creates no `list_collaborators` row.

#### Contract 6.5 checklist
- [ ] Verifies the invite page renders an explicit `invalid` state.
- [ ] Verifies the invite page renders an explicit `expired` state.
- [ ] Verifies the invite page renders an explicit `revoked` state.
- [ ] Verifies the invite page renders an explicit `already_resolved` state.
- [ ] Verifies the invite page renders an explicit `pending_approval` state.
- [ ] Verifies the invite page does not silently redirect from terminal states.

### Specification-Driven TDD Workflow
- First test to write: Failing unit test proving an absolute redirect target is rejected (Contract 6.2).
- Remaining contract-test inventory:
  1. Contract 6.2 cross-origin rejection
  2. Contract 6.2 safe path acceptance
  3. Contract 6.3 continuation preserves token
  4. Contract 6.3 no absolute URLs
  5. Contract 6.4 accepted state transition
  6. Contract 6.4 pending_approval state transition
  7. Contract 6.4 expired outcome
  8. Contract 6.4 revoked outcome
  9. Contract 6.4 invalid outcome
  10. Contract 6.4 already_resolved outcome
  11. Contract 6.4 non-reenterable state transitions
  12. Contract 6.1 logged-out redirect integration
  13. Contract 6.1 matching-email acceptance integration
  14. Contract 6.1 mismatched-email integration
  15. Contract 6.1 reused-secret tests
  16. Contract 6.5 e2e page rendering for each outcome
- Execution rule: Complete each test through RED, GREEN, REFACTOR before adding the next.
- Delete-and-rebuild note: `signIn("github", { redirectTo: "/" })` in `app/sign-in/_components/sign-in.tsx:23` must be rewritten to accept a dynamic `redirectTo` parameter.
- Commands: `npm run test:unit`, `npm run test:integration`, `npm run test:e2e:smoke`, `npm run typecheck`, `npm run lint`

### Files
- `app/invite/page.tsx` (new) — Invite acceptance page
- `lib/invitations/service.ts` — Add `resolveInviteAcceptance`, `acceptInvitationWorkflow`
- `lib/invitations/redirect.ts` (new) — `normalizeRedirectTarget`, `buildInviteContinuationTarget`
- `app/lists/_actions/invitations.ts` — Add acceptance server action
- `app/sign-in/page.tsx` — Accept `redirectTo` search param
- `app/sign-in/_components/sign-in.tsx` — Use dynamic `redirectTo`
- `tests/unit/invitations/redirect.test.ts` (new)
- `tests/unit/invitations/resolution.test.ts` (new)
- `tests/integration/invitations/acceptance.test.ts` (new)
- `tests/e2e/invitations/acceptance.spec.ts` (new)

### Phase Gate
#### Automated Verification
- [ ] Contract JSDoc written above each function before implementation
- [ ] Contract coverage checklist fully checked
- [ ] Contract tests executed one at a time
- [ ] `npm run test:unit` passes
- [ ] `npm run test:integration` passes
- [ ] `npm run test:e2e:smoke` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes

#### Manual Verification
- [ ] Clicking an invite link while logged out redirects to sign-in and resumes after auth
- [ ] Clicking an invite link while logged in with matching email grants list access

---

## Phase 7: Lifecycle & Release Hardening

### Goal
Define the workflows that invalidate invitation state when list lifecycle changes occur and finalize the release gate.

### Phase Execution Rules
- Governing specifications: Contracts 7.1 through 7.4 (inline below)
- Required context: `archiveList` (`app/lists/_actions/list.ts:328`) and `deleteList` (`app/lists/_actions/list.ts:401`) exist but have no invitation lifecycle hooks. Accepted invitations have corresponding `list_collaborators` rows that must survive archive invalidation.
- Dependencies / prerequisites: Phase 4 (Invitation Issuing) must be complete. Phase 3's `invitations` table must exist.
- Chunk dependencies: Chunk D (Phase 4)
- Unblocks: Chunk H (Phase 8 — Collaborator Management)
- Parallelization note: Runs in parallel with Phases 5 and 6. Use `jj workspace add phase-7-lifecycle`. Writes `status` to `revoked`/`expired` and `resolvedAt` on `invitations` only — no overlap with Phase 5 (delivery-tracking columns) or Phase 6 (writes `status` to `accepted`/`pending_approval` — mutually exclusive values).
- Relevant existing files:
  - `app/lists/_actions/list.ts` — `archiveList` and `deleteList` need invalidation hooks
  - `lib/invitations/service.ts` — Add invalidation helper (created in Phase 4)
- Constraints / non-goals: Do not implement invitation acceptance, delivery tracking, or management UI. Do not modify `list_collaborators`.
- Execution order: One RED-GREEN-REFACTOR loop per new contract test.
- Agent handoff note: This phase writes `status` to `revoked` or `expired` on the `invitations` table only. It does NOT touch `list_collaborators` — accepted collaborator rows are unaffected by invitation invalidation. Existing `list_collaborators` rows serve as fixtures for testing that accepted collaborators survive archive/delete. No dependency on Phase 6's acceptance path.

### Specifications

#### Type Definitions
```ts
type InvitationInvalidationTerminalStatus = RevokedInvitationStatus | ExpiredInvitationStatus;
```

#### Contract 7.1: Archive workflow invalidates open invites
```ts
/**
 * @contract archiveListWorkflow
 *
 * Archives a list and invalidates all open invites.
 *
 * @effects
 * - If the archive succeeds, every open invitation row in `invitations` for listId
 *   is moved to a terminal non-accepting state before the caller can observe archive success.
 * - Existing `list_collaborators` rows are unaffected — accepted collaborators remain.
 * - No unrelated list's invitations are modified.
 */
archiveListWorkflow(input: {
  listId: ListId;
  actorId: UserId;
}): Promise<List>
```

#### Contract 7.2: Delete workflow invalidates invite secrets before removal
```ts
/**
 * @contract deleteListWorkflow
 *
 * Deletes a list, ensuring all invitation secrets become unusable.
 *
 * @effects
 * - If the delete succeeds, any previously issued invitation secret for listId
 *   becomes unusable.
 * - The delete path does not allow a race where a token remains valid after
 *   successful deletion.
 */
deleteListWorkflow(input: {
  listId: ListId;
  actorId: UserId;
}): Promise<void>
```

### Step Specifications

#### Contract 7.3: Invalidate open invites for one list
```ts
/**
 * @contract invalidateOpenInvitesForList
 *
 * Moves every open invitation row in `invitations` for listId to terminalStatus.
 * Sets `resolvedAt` on each invalidated row.
 * Does not modify `list_collaborators` or invitations belonging to other lists.
 *
 * @returns The number of invitations invalidated.
 */
invalidateOpenInvitesForList(input: {
  listId: ListId;
  now: Date;
  terminalStatus: InvitationInvalidationTerminalStatus;
}): Promise<number>
```

#### Contract 7.4: Release gate and runbook
```ts
/**
 * @contract Release gate
 *
 * npm run verify:all remains the sole release gate.
 * The release runbook documents required env vars, schema migration order,
 * backfill order, rollback switch, and email-delivery troubleshooting steps.
 */
```

### Contract Coverage Checklist
#### Contract 7.1 checklist
- [ ] Verifies archive success is not observable before all open invitations in `invitations` reach a terminal state.
- [ ] Verifies archive invalidation runs in the same transaction as the list archive state change.
- [ ] Verifies `list_collaborators` rows are unaffected by archive (accepted collaborators remain).
- [ ] Verifies unrelated lists' invitations are untouched by archive-time invalidation.

#### Contract 7.2 checklist
- [ ] Verifies previously issued invitation secrets become unusable after delete.
- [ ] Verifies the delete workflow does not leave a post-success token-validity race.
- [ ] Verifies delete invalidation runs in the same transaction as list deletion.
- [ ] Verifies a concurrent acceptance attempt that loses the delete race creates no `list_collaborators` row.

#### Contract 7.3 checklist
- [ ] Verifies every open invitation in `invitations` for the target list is moved to the requested terminal state with `resolvedAt` set.
- [ ] Verifies only open invitations transition to the requested terminal state; accepted, pending_approval, and already terminal rows remain unchanged.
- [ ] Verifies `list_collaborators` rows are left unchanged by invalidation.
- [ ] Verifies invitations for other lists are left unchanged by invalidation.

#### Contract 7.4 checklist
- [ ] Verifies `npm run verify:all` remains the sole release gate.
- [ ] Verifies the runbook documents required env vars.
- [ ] Verifies the runbook documents schema migration order.
- [ ] Verifies the runbook documents backfill order.
- [ ] Verifies the runbook documents the rollback switch.
- [ ] Verifies the runbook documents email-delivery troubleshooting steps.

### Specification-Driven TDD Workflow
- First test to write: Failing unit test proving one open invite is moved to `revoked` (Contract 7.3).
- Remaining contract-test inventory:
  1. Contract 7.3 invalidates only open invitations
  2. Contract 7.3 accepted collaborators untouched
  3. Contract 7.3 other lists untouched
  4. Contract 7.1 archive integration (open invites invalidated before success observable)
  5. Contract 7.1 accepted collaborators survive archive
  6. Contract 7.1 unrelated lists untouched
  7. Contract 7.2 token unusable after delete
  8. Contract 7.2 no post-delete token race
  9. Contract 7.4 release gate verification
  10. Contract 7.4 runbook completeness
- Execution rule: Complete each test through RED, GREEN, REFACTOR before adding the next.
- Delete-and-rebuild note: `archiveList` (`app/lists/_actions/list.ts:328`) and `deleteList` (`app/lists/_actions/list.ts:401`) must be rewritten to include invalidation hooks.
- Commands: `npm run test:unit`, `npm run test:integration`, `npm run verify:all`

### Files
- `app/lists/_actions/list.ts` — Hook invalidation into `archiveList` and `deleteList`
- `lib/invitations/service.ts` — Add `invalidateOpenInvitesForList`
- `docs/runbook-email-invitations.md` (new) — Release runbook
- `package.json` — Ensure `verify:all` is complete
- `tests/unit/invitations/invalidation.test.ts` (new)
- `tests/integration/invitations/lifecycle.test.ts` (new)

### Phase Gate
#### Automated Verification
- [ ] Contract JSDoc written above each function before implementation
- [ ] Contract coverage checklist fully checked
- [ ] Contract tests executed one at a time
- [ ] `npm run test:unit` passes
- [ ] `npm run test:integration` passes
- [ ] `npm run verify:all` passes

#### Manual Verification
- [ ] Archiving a list with pending invites shows them as revoked in the database
- [ ] Deleting a list with pending invites renders the invite link as invalid

---

## Phase 8: Collaborator Management Workflow & UX

### Goal
Define the end-to-end workflow for users who are allowed to manage collaborators so they can view collaborator state and act on invitations without introducing authorization leaks or N+1 query behavior. The management view merges data from `list_collaborators` and `invitations` using two parallel queries (UNION pattern).

### Phase Execution Rules
- Governing specifications: Contracts 8.1 through 8.6 (inline below)
- Required context: All prior phases must be complete. This phase wires together delivery state (Phase 5), acceptance state (Phase 6), and lifecycle state (Phase 7) into a unified management UX.
- Dependencies / prerequisites: Phases 5, 6, and 7 must all be merged.
- Chunk dependencies: Chunks E + F + G (Wave 4 must be complete)
- Unblocks: `none` (final phase)
- Parallelization note: `none` — convergence point. All Wave 4 workspaces must be merged first.
- Relevant existing files:
  - `app/lists/_components/manage-collaborators.tsx` — Existing dropdown to extend
  - `app/lists/_components/list.tsx` — Dropdown trigger
  - `app/lists/_actions/permissions.ts` — Permission model
  - `lib/invitations/service.ts` — All invitation service functions from prior phases
  - `app/lists/_actions/invitations.ts` — All invitation server actions from prior phases
- Constraints / non-goals: Do not add new auth providers. Do not build notification center.
- Execution order: One RED-GREEN-REFACTOR loop per new contract test.
- Agent handoff note: This phase is the convergence point. It requires ALL prior phases to be merged. It adds a dedicated `/lists/collaborators` management page and extends the existing dropdown with invitation actions. All actions must remain server-authoritative.

### Specifications

#### Type Definitions
```ts
type SentInvitationSummary = {
  kind: "sent";
  invitationId: InvitationId;
  listId: ListId;
  invitedEmailNormalized: NormalizedEmailAddress;
  expiresAt: InvitationExpiry;
};

type PendingApprovalInvitationSummary = {
  kind: "pending_approval";
  invitationId: InvitationId;
  listId: ListId;
  invitedEmailNormalized: NormalizedEmailAddress;
  expiresAt: InvitationExpiry;
  /** The user who attempted to accept with a mismatched email */
  acceptedByUserId: UserId;
  /** The email used to sign in (differs from invitedEmailNormalized) */
  acceptedByEmail: NormalizedEmailAddress | null;
};

type InvitationSummary = SentInvitationSummary | PendingApprovalInvitationSummary;

type ActorCollaboratorCapabilities = {
  canResend: boolean;
  canRevoke: boolean;
  canCopyLink: boolean;
  canApprove: boolean;
  canReject: boolean;
};

type InvitationAction =
  | { kind: "resend"; invitationId: InvitationId }
  | { kind: "revoke"; invitationId: InvitationId }
  | { kind: "copy_link"; invitationId: InvitationId }
  | { kind: "approve"; invitationId: InvitationId }
  | { kind: "reject"; invitationId: InvitationId };

type SentInvitationAction = Extract<InvitationAction, { kind: "resend" | "revoke" | "copy_link" }>;
type PendingApprovalInvitationAction = Extract<InvitationAction, { kind: "approve" | "reject" }>;

type CollaboratorManagementListView = {
  list: ListWithRole;
  acceptedCollaborators: ReadonlyArray<AcceptedCollaborator>;
  invitations: ReadonlyArray<InvitationSummary>;
};

type CollaboratorManagementViewData = {
  manageableLists: ReadonlyArray<CollaboratorManagementListView>;
};
```

#### Contract 8.1: Collaborator management workflow
```ts
/**
 * @contract loadCollaboratorManagementWorkflow
 *
 * Loads the data needed to render collaborator management views.
 *
 * @effects
 * - Requires actorId to be allowed to manage collaborators for each returned list.
 * - Returns accepted collaborators, open invites, and pending_approval entries.
 * - Excludes lists for which actorId is not allowed to manage collaborators.
 * - Returns enough data to drive resend, revoke, copy-link, approve, and reject actions.
 */
loadCollaboratorManagementWorkflow(input: {
  actorId: UserId;
}): Promise<CollaboratorManagementViewData>
```

### Step Specifications

#### Contract 8.2: Collaborator-management permission check
```ts
/**
 * @contract assertCanManageCollaborators
 *
 * Returns successfully iff actorId is allowed to manage collaborators for listId.
 * Does not mutate collaborator or invitation state.
 *
 * @throws CollaboratorManagementPermissionDeniedError if not allowed.
 */
assertCanManageCollaborators(input: {
  listId: ListId;
  actorId: UserId;
}): Promise<void>
```

#### Contract 8.3: Collaborator management view-data loader
```ts
/**
 * @contract getCollaboratorManagementViewData
 *
 * Returns all lists, accepted collaborators, open invites, and pending_approval
 * entries manageable by actorId. Merges data from `list_collaborators` (accepted
 * members) and `invitations` (open + pending_approval) using parallel queries.
 *
 * @effects
 * - Executes in a bounded number of database queries with respect to returned lists.
 *   Must not perform one additional query per list (no N+1). The expected pattern
 *   is two parallel queries: one to `list_collaborators`, one to `invitations`
 *   filtered by `status IN ('pending', 'sent', 'pending_approval')`.
 * - Preserves server-authoritative identifiers needed for invitation actions.
 * - For `pending_approval` invitations, includes `acceptedByEmail` and
 *   `acceptedByUserId` so the manager can see who attempted to join and from
 *   which email.
 */
getCollaboratorManagementViewData(input: {
  actorId: UserId;
}): Promise<CollaboratorManagementViewData>
```

#### Contract 8.4: Invitation action availability mapping
```ts
/**
 * @contract getAvailableInvitationActions
 *
 * Returns only the actions valid for the invitation's current state and
 * the actor's capabilities. Does not include actions the actor is not allowed to perform.
 */
getAvailableInvitationActions<TInvitation extends InvitationSummary>(input: {
  invitation: TInvitation;
  actorCapabilities: ActorCollaboratorCapabilities;
}): ReadonlyArray<
  TInvitation extends PendingApprovalInvitationSummary
    ? PendingApprovalInvitationAction
    : SentInvitationAction
>
```

#### Contract 8.5: Collaborator management route behavior
```ts
/**
 * @contract /lists/collaborators route
 *
 * @effects
 * - Renders workflow data from Contract 8.1 for authenticated users allowed to
 *   manage at least one list.
 * - Unauthenticated users are redirected to sign-in.
 * - Authenticated users without access do not receive collaborator-management
 *   data for unauthorized lists.
 */
```

#### Contract 8.6: UI actions preserve server authority
```ts
/**
 * @contract Server-authoritative UI actions
 *
 * Send, resend, revoke, approve, reject, and copy-link flows use the server
 * contracts from Phases 4, 5, and 6 as the source of truth. Client code does
 * not assume a state transition succeeded until the server contract reports success.
 *
 * Approve atomically: updates `invitations.status` to 'accepted', sets `resolvedAt`,
 * and inserts a `list_collaborators` row for the `acceptedByUserId`.
 * Reject updates `invitations.status` to 'revoked' and sets `resolvedAt`.
 */
```

### Contract Coverage Checklist
#### Contract 8.1 checklist
- [ ] Verifies the workflow returns only lists manageable by the actor.
- [ ] Verifies the workflow includes accepted collaborators.
- [ ] Verifies the workflow includes open invites.
- [ ] Verifies the workflow includes `pending_approval` invites.
- [ ] Verifies returned state is sufficient to drive resend actions.
- [ ] Verifies returned state is sufficient to drive revoke actions.
- [ ] Verifies returned state is sufficient to drive copy-link actions.
- [ ] Verifies returned state is sufficient to drive approve actions (including `acceptedByEmail` and `acceptedByUserId` for pending_approval invitations).
- [ ] Verifies returned state is sufficient to drive reject actions.

#### Contract 8.2 checklist
- [ ] Verifies allowed actors pass.
- [ ] Verifies denied actors raise `CollaboratorManagementPermissionDeniedError`.
- [ ] Verifies the check does not mutate collaborator state.
- [ ] Verifies the check does not mutate invitation state.

#### Contract 8.3 checklist
- [ ] Verifies manageable-list data includes all required lists.
- [ ] Verifies manageable-list data includes accepted collaborators.
- [ ] Verifies manageable-list data includes open invites.
- [ ] Verifies manageable-list data includes `pending_approval` invites.
- [ ] Verifies query count remains bounded as manageable lists grow.
- [ ] Verifies unauthorized lists are excluded.
- [ ] Verifies authoritative identifiers are preserved.

#### Contract 8.4 checklist
- [ ] Verifies available actions are constrained by invitation state.
- [ ] Verifies available actions are constrained by actor capability.
- [ ] Verifies forbidden actions are never offered.

#### Contract 8.5 checklist
- [ ] Verifies unauthenticated users are redirected to sign-in.
- [ ] Verifies authenticated managers see authorized data.
- [ ] Verifies unauthorized users do not receive unauthorized data.

#### Contract 8.6 checklist
- [ ] Verifies send flows remain server-authoritative.
- [ ] Verifies resend flows remain server-authoritative.
- [ ] Verifies revoke flows remain server-authoritative.
- [ ] Verifies approve flows remain server-authoritative.
- [ ] Verifies reject flows remain server-authoritative.
- [ ] Verifies copy-link flows remain server-authoritative.
- [ ] Verifies approve performs the allowed `pending_approval -> accepted` transition atomically with collaborator creation.
- [ ] Verifies reject performs the allowed `pending_approval -> revoked` transition without creating a collaborator row.

### Specification-Driven TDD Workflow
- First test to write: Failing unit test proving an unauthorized actor is denied collaborator-management capability (Contract 8.2).
- Remaining contract-test inventory:
  1. Contract 8.4 pending_approval exposes approve/reject but not resend
  2. Contract 8.4 sent exposes resend/revoke/copy_link but not approve
  3. Contract 8.3 data loader returns accepted + open + pending_approval
  4. Contract 8.3 excludes unauthorized lists
  5. Contract 8.3 bounded query count
  6. Contract 8.6 approve transition integration
  7. Contract 8.6 reject transition integration
  8. Contract 8.1 full workflow integration
  9. Contract 8.5 unauthenticated redirect e2e
  10. Contract 8.5 authenticated manager sees data e2e
  11. Contract 8.6 resend e2e
  12. Contract 8.6 approve e2e
  13. Contract 8.6 revoke, reject, copy-link e2e (one at a time)
- Execution rule: Complete each test through RED, GREEN, REFACTOR before adding the next.
- Delete-and-rebuild note: `app/lists/_components/manage-collaborators.tsx` must be extended (not rewritten) to include pending invites and management actions.
- Commands: `npm run test:unit`, `npm run test:integration`, `npm run test:e2e:smoke`, `npm run typecheck`, `npm run lint`

### Files
- `app/lists/_components/manage-collaborators.tsx` — Extend with invitation actions
- `app/lists/_components/list.tsx` — Extend dropdown
- `app/lists/collaborators/page.tsx` (new) — Dedicated management page
- `app/lists/_components/user-lists.tsx` — Link to management page
- `app/lists/page.tsx` — Navigation
- `lib/invitations/service.ts` — Add management workflow
- `app/lists/_actions/invitations.ts` — Add management server actions
- `app/lists/_actions/permissions.ts` — Add `assertCanManageCollaborators`
- `tests/unit/invitations/action-availability.test.ts` (new)
- `tests/integration/invitations/collaborator-management.test.ts` (new)
- `tests/e2e/invitations/collaborator-management.spec.ts` (new)

### Phase Gate
#### Automated Verification
- [ ] Contract JSDoc written above each function before implementation
- [ ] Contract coverage checklist fully checked
- [ ] Contract tests executed one at a time
- [ ] `npm run test:unit` passes
- [ ] `npm run test:integration` passes
- [ ] `npm run test:e2e:smoke` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run verify:all` passes

#### Manual Verification
- [ ] Owner can send, resend, revoke invites from the management page
- [ ] Owner can approve/reject pending_approval invites
- [ ] Non-owners cannot access management actions

---

## Cross-Phase Test Strategy

### Unit Contracts
- Invitation secret creation and hashing (Phase 4).
- Invitation permission and collaborator-management permission checks (Phases 4, 8).
- Redirect target normalization and continuation-target construction (Phase 6).
- Invitation action-availability mapping (Phase 8).
- Invite invalidation helper behavior (Phase 7).
- Env verification behavior (Phase 1).
- Resend send-response normalization (Phase 5).

### Integration Contracts
- Owner invariant enforcement (Phase 1).
- `invitations` table schema, indexes, and uniqueness constraints (Phase 3).
- Whole invitation issue-and-send workflow writing to `invitations` table (Phase 4).
- Immediate Resend send-response handling updating delivery columns on `invitations` (Phase 5).
- Authenticated webhook signature verification and delivery column updates (Phase 5).
- Whole invitation acceptance workflow: `invitations` status update + `list_collaborators` row creation, including email-mismatch tracking (Phase 6).
- Archive and delete invalidation of `invitations` rows (Phase 7).
- Whole collaborator-management data workflow merging `list_collaborators` and `invitations` with bounded-query requirement (Phase 8).

### State Transition Contracts
- Phase 4: issue and resend preserve the single-open-invite lifecycle shape (`new/open -> sent`, `open -> sent` via rotation only).
- Phase 6: open invitations can transition to `accepted` or `pending_approval`; non-open invitations are non-reenterable.
- Phase 7: only open invitations can transition to `revoked` or `expired`; accepted and pending_approval rows remain unchanged.
- Phase 8: manager approval transitions `pending_approval -> accepted`; manager rejection transitions `pending_approval -> revoked`.

### E2E Contracts
- Logged-out invite continuation through sign-in (Phase 6).
- Invite acceptance outcomes for valid, invalid, expired, revoked, already_resolved, and pending_approval states (Phase 6).
- Invitation management actions for allowed managers (Phase 8).

## E2E Scenario Matrix

All invitation e2e scenarios use Playwright plus the Phase 4 test-stub `EmailService` unless a scenario explicitly exercises the production Resend adapter outside CI. The dependency list below is strict: a scenario should not be implemented before its prerequisite phases land.

1. Harness smoke scenario
   - Depends on: Phase 2
   - Purpose: prove browser harness operability only
2. Invite creation reaches the email stub and captures an acceptance URL
   - Depends on: Phases 2, 4
   - Purpose: prove end-to-end issuance without live third-party delivery
3. Logged-out recipient follows invite, signs in, and accepts on matching email
   - Depends on: Phases 2, 4, 6
   - Purpose: happy-path invite continuation and acceptance
4. Already-signed-in recipient accepts immediately on matching email
   - Depends on: Phases 2, 4, 6
   - Purpose: acceptance without redirect
5. Recipient with mismatched email reaches `pending_approval`
   - Depends on: Phases 2, 4, 6
   - Purpose: verify mismatch handling does not create collaborator access
6. Invalid invite token renders explicit invalid state
   - Depends on: Phases 2, 4, 6
   - Purpose: explicit terminal rendering with no mutation
7. Expired invite token renders explicit expired state
   - Depends on: Phases 2, 4, 6
   - Purpose: expiry enforcement at acceptance time
8. Reused resolved token renders explicit already_resolved state
   - Depends on: Phases 2, 4, 6
   - Purpose: prevent replay after acceptance or prior resolution
9. Archived list invalidates an open invite link
   - Depends on: Phases 2, 4, 6, 7
   - Purpose: prove archive-time invalidation closes prior links
10. Deleted list invalidates an open invite link
   - Depends on: Phases 2, 4, 6, 7
   - Purpose: prove delete-time invalidation closes prior links with no post-success race
11. Manager approves a `pending_approval` invite
   - Depends on: Phases 2, 4, 6, 8
   - Purpose: prove `pending_approval -> accepted` plus collaborator creation
12. Manager rejects a `pending_approval` invite
   - Depends on: Phases 2, 4, 6, 8
   - Purpose: prove `pending_approval -> revoked` without collaborator creation
13. Manager resends an open invite and only the latest link remains valid
   - Depends on: Phases 2, 4, 8
   - Purpose: prove rotation through the management UI
14. Manager revokes an open invite
   - Depends on: Phases 2, 4, 8
   - Purpose: prove revoke action closes the link immediately
15. Unauthorized user cannot access collaborator-management data or actions
   - Depends on: Phases 2, 4, 6, 8
   - Purpose: prove server-authoritative authorization in the browser flow

## Migration Notes
- Apply the `invitations` table migration (Phase 3) before shipping any invitation UI or acceptance route.
- No backfill of `list_collaborators` is needed — the table is unchanged.
- Run the owner-collaborator backfill (Phase 1) before or immediately after the `invitations` table migration.
- The `invitations` table starts empty; no data migration is required.
- Keep the owner-collaborator backfill idempotent.
- If production rollout fails, disable invitation entry points with a feature flag or env gate while preserving existing `list_collaborators` behavior (which is untouched).

## Security Review

**Status:** Concerns Noted
**Reviewed:** 2026-03-11

### Findings

**Token Security (High Priority)**
- Invitation secrets must be generated using `crypto.randomBytes` (or equivalent CSPRNG), not `Math.random` or UUIDs.
- Secrets must be hashed (SHA-256 minimum) before database storage. Raw secrets must never be persisted.
- Token expiry must be enforced server-side at acceptance time, not just checked client-side.
- One-time-use: after acceptance or terminal transition, the token hash must be invalidated so replay produces a terminal outcome.

**Open Redirect Prevention (High Priority)**
- Contract 6.2 (`normalizeRedirectTarget`) is the critical defense. The implementation must:
  - Reject any URL with a scheme (http://, https://, javascript:, data:, etc.)
  - Reject protocol-relative URLs (//)
  - Only allow paths starting with a single `/` followed by a non-`/` character
  - URL-decode before validation to prevent double-encoding bypass

**Webhook Authentication (Medium Priority)**
- Svix signature verification must use constant-time comparison to prevent timing attacks.
- The raw body used for signature verification must be the exact bytes received, not a re-serialized version.
- Webhook endpoint should not leak internal state in error responses.

**Email Normalization (Medium Priority)**
- Email comparison must be case-insensitive and trimmed before hashing or matching.
- Consider RFC 5321 normalization (lowercase local-part and domain) for the `NormalizedEmailAddress` type.

**Permission Model (Low Priority)**
- Capability-based authorization is correct for this use case.
- Ensure that `assertCanInviteCollaborators` and `assertCanManageCollaborators` check the database state at call time, not cached state, to prevent TOCTOU issues.

**Test Email Adapter Boundary (Low Priority)**
- The test-stub `EmailService` must be enabled only in test environments.
- Any mailbox or invite-capture helper used by Playwright must not be reachable in production.
- Production email adapters must not log raw acceptance URLs or tokens while sharing the same interface as the test stub.

### Checklist Coverage
- [x] Authentication & Authorization: Capability-based checks, permission assertions
- [x] Input Validation: Email normalization, redirect target validation, env validation
- [x] Cryptographic Operations: Token generation, hashing, webhook signature verification
- [x] Injection Prevention: Drizzle ORM parameterized queries, no raw SQL
- [x] Data Exposure: Hashed secrets only in DB, no raw tokens in logs
- [x] Rate Limiting: Explicitly out of scope (documented in "What We Are Not Doing")
- [x] CSRF: Handled by Next.js server actions
- [ ] Content Security Policy: Not applicable to this feature

## References
- Existing plan: `thoughts/shared/plans/2026-02-05-email-invitation-system.md`
- Roadmap item: `plan/backlog.md`
- Existing collaborator actions: `app/lists/_actions/collaborators.ts:50`
- Permission model: `app/lists/_actions/permissions.ts:27`
- List page access gate: `app/lists/[listId]/page.tsx`
- Sign-in redirect behavior: `app/sign-in/_components/sign-in.tsx:23`
- Schema baseline: `drizzle/schema.ts:54`
- Owner backfill utility: `drizzle/backfillListCollaborators.ts:5`
- Resend send-email API: resend.com/docs/api-reference/emails/send-email
- Resend webhooks: resend.com/docs/dashboard/webhooks/introduction
