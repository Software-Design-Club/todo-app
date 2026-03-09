# Email Invitation System Implementation Plan

## Review Outcome
This revision keeps the plan contract-first, but reorganizes the implementation around invitation workflows instead of isolated task buckets.

Every affected phase now includes:
- A workflow-level specification verified through integration tests.
- Step-level specifications verified one behavior at a time, with unit tests where the step can be isolated and integration tests where persistence or routing is part of the contract.
- Strict `SPEC -> RED -> GREEN -> REFACTOR` sequencing with exactly one new failing test per loop.
- Test sequencing that is one test at a time, but cumulative coverage that must span the whole contract before the phase is complete.
- Capability-based authorization language for invitation and collaborator-management actions.
- Explicit invitation-domain type definitions before the contracts that use them, using branded identifiers, secrets, URLs, and discriminated unions to rule out mixed states.

All contracts in this plan are deterministic unless a contract explicitly says otherwise.

## Global Contract Rules
1. No production code for invitation behavior may be added or changed until the affected contract is written.
2. No changed behavior may be kept unless a single failing contract test proves the gap first.
3. Each red-green-refactor loop adds exactly one new failing test for one observable behavior.
4. A contract is not done when one test passes; keep adding one failing test at a time until the accumulated suite covers every documented output, error case, side effect, and state transition promised by that contract.
5. Tests may assert only observable behavior: inputs, outputs, documented errors, persisted state, rendered UI, redirects, and externally visible side effects.
6. Authorization contracts are capability-based. Use `user allowed to invite collaborators to this list` and `user allowed to manage collaborators for this list` instead of binding the spec to a specific role unless the role itself is the domain requirement.
7. Prefer domain types over raw primitives whenever the type system can express the business rule.
8. If existing implementation conflicts with a newly written contract, rewrite the changed behavior from the contract instead of adapting tests to incidental behavior.
9. Define new invitation-domain types before the first contract that uses them, and prefer branded or discriminated forms that make illegal states unrepresentable.

## Overview
Implement roadmap item 5 from `agent-os/product/roadmap.md:26` by adding email-based collaborator invitations with secure one-time tokens, sign-in continuation, and collaborator-management controls.

This plan remains automation-first: after initial environment setup, phase completion is validated by automated checks whenever technically possible.

## Current State Analysis

### What Exists Today
- Collaborators are added only by selecting existing users and inserting directly into `list_collaborators` via `addCollaborator` (`app/lists/_actions/collaborators.ts:50`).
- Collaborators are loaded via `getCollaborators`, which uses an inner join to `todo_users` and therefore only returns rows with a concrete `userId` (`app/lists/_actions/collaborators.ts:118`, `app/lists/_actions/collaborators.ts:133`).
- Collaborator management UI is a dropdown panel scoped to a single list (`app/lists/_components/list.tsx:104`, `app/lists/_components/manage-collaborators.tsx:1`).
- Private list access is enforced by collaborator membership checks (`app/lists/_actions/permissions.ts:56`, `app/lists/[listId]/page.tsx:27`).
- Sign-in always redirects to `/` and cannot preserve invite continuation (`app/sign-in/_components/sign-in.tsx:23`).
- List lifecycle operations exist (archive/delete) but have no invitation lifecycle hook (`app/lists/_actions/list.ts:326`, `app/lists/_actions/list.ts:399`).
- `resend` is installed but there is no email-delivery code path in `app/` or `lib/` (`package.json:35`).
- The codebase currently has no unit, integration, or e2e test harness configured (`package.json:6`).

### Gaps Blocking Invitations
- No invitation token generation, persistence, or acceptance route exists.
- `list_collaborators.userId` is non-nullable, which cannot represent email-only pending invites (`drizzle/schema.ts:60`).
- Current collaborator queries and tagged types assume all records are accepted user memberships (`lib/types.ts:30`, `app/lists/_actions/collaborators.ts:118`).
- `createList` currently does not guarantee owner collaborator row creation; owner rows are only backfilled by script (`app/lists/_actions/list.ts:165`, `drizzle/backfillListCollaborators.ts:27`).

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
- Persist invitation lifecycle by extending `list_collaborators`; do not add a separate invitations table.
- Keep strict email matching on acceptance; mismatch enters `pending_approval`.
- Keep the existing dropdown workflow and add a dedicated collaborator management page.
- Keep GitHub auth provider for MVP.
- Keep authorization contracts capability-based so the implementation can evolve without rewriting the plan.

## What We Are Not Doing
- Adding new auth providers.
- Building a full notification center.
- Adding global anti-abuse infrastructure beyond basic validation and permission checks.
- Building advanced email analytics dashboards.

## Version Control Workflow (Jujutsu)
- Before Phase 1, create the feature bookmark: `jj bookmark create codex/email-invitation-system` or move the existing bookmark with `jj bookmark set codex/email-invitation-system -r @`.
- After each phase, make exactly one `jj` commit.
- Each checkpoint commit must have:
  - A one-sentence subject describing what was actually completed in that phase.
  - A body that records what was actually implemented, what tests were added or changed, which verification commands were run, and any notable limitations or follow-ups discovered during implementation.
- Use this template for every checkpoint, replacing the placeholders with facts from the implementation that just landed:

```bash
jj commit \
  -m "Phase N: [one-sentence description of what was actually completed]" \
  -m $'Implemented:\n- [specific code paths, routes, services, migrations, or UI behavior that changed]\n- [specific data model or state-transition changes introduced]\nTests:\n- [single-behavior tests added in this phase]\n- [integration/e2e workflows now covered]\nVerification:\n- [commands actually run]\n- [key results]\nNotes:\n- [limitations, follow-ups, or rollout-relevant observations]'
```

---

## Phase 1: Foundation and Invariants

### Goal
Make owner membership and invitation environment validation explicit, testable contracts.

### Phase Execution Rules
- Treat this phase as incomplete until every checkbox in the Contract Coverage Checklist for Contracts 1.1 through 1.4 is checked off by the accumulated test suite.
- Treat every contract in this phase as requiring at least one explicit verifying test that was added by following this phase's Specification-Driven TDD Workflow.
- Move in single-behavior loops only: write exactly one new failing contract test, make only the smallest production change needed to pass it, then refactor without changing observable behavior.
- Do not stop after the first representative test in this phase passes. After each green step, identify the next unchecked contract effect, error, or non-effect from this phase and start the next failing test for that specific gap.
- If work resumes mid-phase, begin by listing which Contract Coverage Checklist boxes are already checked, which verifying test satisfies each checked box, and continue with the first unchecked box.

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

type InvitationId = Tagged<number, "InvitationId">;
type InvitationSecret = Tagged<string, "InvitationSecret">;
type InvitationSecretHash = Tagged<string, "InvitationSecretHash">;
type InvitationExpiry = Tagged<Date, "InvitationExpiry">;
type InvitationResolvedAt = Tagged<Date, "InvitationResolvedAt">;
type DeliveryAttemptedAt = Tagged<Date, "DeliveryAttemptedAt">;
type ProviderMessageId = Tagged<string, "ProviderMessageId">;

type ResendApiKey = Tagged<string, "ResendApiKey">;
type ResendWebhookSecret = Tagged<string, "ResendWebhookSecret">;
type EmailFromAddress = Tagged<string, "EmailFromAddress">;
type ResendErrorMessage = Tagged<string, "ResendErrorMessage">;
type ResendErrorName = Tagged<string, "ResendErrorName">;

type CreateListInput = {
  title: ListTitle;
  creatorId: UserId;
  visibility?: ListVisibility;
};

type AuthenticatedUser = Pick<User, "id" | "email" | "name">;

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
upsertOwnerCollaborator(input: {
  listId: ListId;
  ownerId: UserId;
}): Promise<OwnerCollaboratorUpsertResult>
```
Effects:
- If the list and user exist, then after return exactly one `list_collaborators` row exists for `(listId, ownerId)` with `role = "owner"` and `inviteStatus = "accepted"`.
- After return, the owner row is usable by the same collaborator-read path used for accepted collaborators.
- The function does not create duplicate accepted owner memberships for the same `(listId, ownerId)`.
- The function does not modify collaborator rows for unrelated lists or users.

Throws:
- `ListNotFoundError` if `listId` does not identify an existing list.
- `UserNotFoundError` if `ownerId` does not identify an existing user.

#### Contract 1.2: List creation preserves the owner invariant
```ts
createList(input: CreateListInput): Promise<List>
```
Effects:
- If the function returns list `L`, then `upsertOwnerCollaborator({ listId: L.id, ownerId: L.creatorId })` has already become true before the caller can observe success.
- The function does not report success for a newly created list whose creator lacks accepted owner membership.

#### Contract 1.3: Historical repair is idempotent
```ts
backfillOwnerCollaborators(): Promise<{
  scanned: number;
  inserted: number;
  repaired: number;
  unchanged: number;
}>
```
Effects:
- After return, every existing list has an accepted owner collaborator row for its creator.
- Running the function multiple times without intervening data changes does not create additional collaborator rows and does not change the final database state after the first successful run.

#### Contract 1.4: Invitation environment is validated before use
```ts
verifyInvitationEnv(env: NodeJS.ProcessEnv): InvitationEnv
```
Effects:
- Returns a normalized configuration object iff all required invitation settings are present and syntactically valid.
- Rejects missing required keys by naming the missing key.
- Rejects invalid values by naming the offending key and reason.
- Accepts only `http` or `https` application base URLs.

### Contract Coverage Checklist
Every checkbox below must be checked off only by a TEST that verifies that behavior. Do not check a box based on code inspection, reasoning, or manual belief alone.
#### Contract 1.1 checklist
- [ ] Verifies the `"inserted"` outcome.
- [ ] Verifies the `"repaired"` outcome.
- [ ] Verifies the `"unchanged"` outcome.
- [ ] Verifies the owner row is visible through the same accepted-collaborator read path used elsewhere in the app.
- [ ] Verifies repeated calls do not create duplicate accepted owner memberships for the same `(listId, ownerId)`.
- [ ] Verifies unrelated collaborator rows are not modified.
- [ ] Verifies `ListNotFoundError`.
- [ ] Verifies `UserNotFoundError`.

#### Contract 1.2 checklist
- [ ] Verifies successful `createList` is not observable before accepted owner membership exists.
- [ ] Verifies the accepted owner row created by `createList` is visible through the same read path used elsewhere in the app.

#### Contract 1.3 checklist
- [ ] Verifies every existing list is repaired to have an accepted owner collaborator row.
- [ ] Verifies the repair report accounts for inserted work accurately.
- [ ] Verifies the repair report accounts for repaired work accurately.
- [ ] Verifies the repair report accounts for unchanged work accurately.
- [ ] Verifies repeated runs do not create extra collaborator rows.
- [ ] Verifies repeated runs do not change final database state after the first successful pass.

#### Contract 1.4 checklist
- [ ] Verifies normalized success output.
- [ ] Verifies each missing required key is named in the failure.
- [ ] Verifies invalid values name the offending key and reason.
- [ ] Verifies `http` base URLs are accepted.
- [ ] Verifies `https` base URLs are accepted.
- [ ] Verifies non-HTTP(S) base URLs are rejected.
- [ ] Verifies `resendWebhookSecret` remains optional.

### Specification-Driven TDD Workflow
1. `SPEC`: Write Contracts 1.1 and 1.2.
2. `RED`: Add one failing integration test proving `createList` is not observable without an accepted owner collaborator row.
3. `GREEN`: Implement the minimal owner-upsert path needed for that test.
4. `REFACTOR`: Extract the smallest shared helper.
5. `SPEC`: Write Contract 1.3.
6. `RED`: Add one failing integration test proving backfill repairs one missing owner row.
7. `GREEN`: Implement the smallest repair behavior.
8. `REFACTOR`: Keep the helper idempotent.
9. `RED`: Add one failing integration test proving repeated backfill leaves state unchanged.
10. `GREEN`: Tighten idempotence behavior.
11. `REFACTOR`: Remove duplication without changing observable output.
12. `SPEC`: Write Contract 1.4.
13. `RED`: Add one failing unit test for one missing required env var.
14. `GREEN`: Implement the smallest failing-key report.
15. `REFACTOR`: Normalize config output.
16. `RED`: Add one failing unit test for one syntactically invalid `APP_BASE_URL`.
17. `GREEN`: Implement URL validation.
18. `REFACTOR`: Keep error reporting precise.
19. `COVERAGE`: Before closing the phase, keep adding exactly one failing test at a time until every checkbox in the Contract Coverage Checklist for Contracts 1.1 through 1.4 is checked.

### Files
- `app/lists/_actions/list.ts`
- `app/sign-in/_components/_actions/find-or-create-account.ts`
- `drizzle/backfillListCollaborators.ts`
- `.env.example`
- `scripts/verify-env.mjs` (new)
- `package.json`

### Phase Gate
- [ ] Every red-green-refactor loop above was completed in order, with one new failing test at a time.
- [ ] Every contract in this phase is verified by at least one explicit test added through the Specification-Driven TDD Workflow.
- [ ] The accumulated unit and integration suites for Contracts 1.1 through 1.4 cover every documented output, error case, and side effect.
- [ ] `npm run verify:env` passes for a valid env file.
- [ ] `npm run typecheck` passes.

**Jujutsu Checkpoint Subject**: `Phase 1: [describe the owner-invariant and env-validation work that was actually completed]`

---

## Phase 2: Test Harness Bootstrap

### Goal
Create stable test commands whose behavior is itself specified and verifiable before invitation work depends on them.

### Phase Execution Rules
- Treat this phase as incomplete until every checkbox in the Contract Coverage Checklist for Contracts 2.1 through 2.5 is checked off by the accumulated test suite.
- Treat every contract in this phase as requiring at least one explicit verifying test that was added by following this phase's Specification-Driven TDD Workflow.
- Move in single-behavior loops only: write exactly one new failing contract test, make only the smallest harness or script change needed to pass it, then refactor without changing observable behavior.
- Do not stop after the first smoke test or first command-success case passes. After each green step, identify the next unchecked command outcome or harness guarantee from this phase and start the next failing test for that specific gap.
- If work resumes mid-phase, begin by listing which Contract Coverage Checklist boxes are already checked, which verifying test satisfies each checked box, and continue with the first unchecked box.

### Specifications

#### Contract 2.1: Unit test command
```ts
npm run test:unit
```
Effects:
- Executes the unit test suite and exits with code `0` iff all unit tests pass.
- Exits with non-zero status if any unit test fails or the unit harness cannot start.
- Does not run integration or e2e suites.

#### Contract 2.2: Integration test command
```ts
npm run test:integration
```
Effects:
- Executes the integration test suite and exits with code `0` iff all integration tests pass.
- Exits with non-zero status if any integration test fails or the integration harness cannot start.

#### Contract 2.3: E2E smoke command
```ts
npm run test:e2e:smoke
```
Effects:
- Executes the smoke subset of the e2e suite and exits with code `0` iff the smoke scenarios pass.
- Exits with non-zero status if any smoke scenario fails or the e2e harness cannot start.

#### Contract 2.4: Aggregate verification command
```ts
npm run verify:all
```
Effects:
- Executes `verify:env`, `typecheck`, `lint`, `test:unit`, `test:integration`, and `test:e2e:smoke` in a fixed order.
- Exits with code `0` iff every command above exits with code `0`.
- Exits with non-zero status if any prerequisite command fails.

#### Contract 2.5: Baseline smoke coverage exists at each layer
Effects:
- Each of the unit, integration, and e2e layers contains at least one intentionally minimal contract test that fails when that harness is misconfigured.
- These tests assert harness operability only.

### Contract Coverage Checklist
Every checkbox below must be checked off only by a TEST that verifies that behavior. Do not check a box based on code inspection, reasoning, or manual belief alone.
#### Contract 2.1 checklist
- [ ] Verifies `npm run test:unit` exits `0` when all unit tests pass.
- [ ] Verifies `npm run test:unit` exits non-zero when a unit test fails.
- [ ] Verifies `npm run test:unit` exits non-zero when the unit harness cannot start.
- [ ] Verifies `npm run test:unit` does not run integration tests.
- [ ] Verifies `npm run test:unit` does not run e2e tests.

#### Contract 2.2 checklist
- [ ] Verifies `npm run test:integration` exits `0` when all integration tests pass.
- [ ] Verifies `npm run test:integration` exits non-zero when an integration test fails.
- [ ] Verifies `npm run test:integration` exits non-zero when the integration harness cannot start.

#### Contract 2.3 checklist
- [ ] Verifies `npm run test:e2e:smoke` exits `0` when the smoke scenarios pass.
- [ ] Verifies `npm run test:e2e:smoke` exits non-zero when a smoke scenario fails.
- [ ] Verifies `npm run test:e2e:smoke` exits non-zero when the e2e harness cannot start.

#### Contract 2.4 checklist
- [ ] Verifies `verify:all` runs commands in the fixed order.
- [ ] Verifies `verify:all` exits `0` when every prerequisite command succeeds.
- [ ] Verifies `verify:all` exits non-zero when any prerequisite command fails.

#### Contract 2.5 checklist
- [ ] Verifies the unit layer has a minimal operability test that fails when the unit harness is misconfigured.
- [ ] Verifies the integration layer has a minimal operability test that fails when the integration harness is misconfigured.
- [ ] Verifies the e2e layer has a minimal operability test that fails when the e2e harness is misconfigured.

### Specification-Driven TDD Workflow
1. `SPEC`: Write Contract 2.1.
2. `RED`: Add one failing unit smoke test.
3. `GREEN`: Install the smallest unit harness needed to run and pass that test.
4. `REFACTOR`: Extract minimal shared setup.
5. `SPEC`: Write Contract 2.2.
6. `RED`: Add one failing integration smoke test.
7. `GREEN`: Install the smallest integration harness needed to run and pass that test.
8. `REFACTOR`: Align setup with the unit harness without changing command behavior.
9. `SPEC`: Write Contract 2.3.
10. `RED`: Add one failing e2e smoke test.
11. `GREEN`: Install the smallest e2e harness needed to run and pass that test.
12. `REFACTOR`: Keep environment bootstrapping minimal.
13. `SPEC`: Write Contract 2.4.
14. `RED`: Add one failing command-order assertion or command-chain failure case.
15. `GREEN`: Implement the smallest `verify:all` script that satisfies the contract.
16. `REFACTOR`: Remove script duplication while keeping command order fixed.
17. `COVERAGE`: Before closing the phase, keep adding exactly one failing test at a time until every checkbox in the Contract Coverage Checklist for Contracts 2.1 through 2.5 is checked.

### Files
- `package.json`
- `vitest.config.ts` (new)
- `playwright.config.ts` (new)
- `tests/setup/*.ts` (new)
- `tests/unit/smoke.test.ts` (new)
- `tests/integration/smoke.test.ts` (new)
- `tests/e2e/smoke.spec.ts` (new)

### Phase Gate
- [ ] Every red-green-refactor loop above was completed in order, with one new failing test at a time.
- [ ] Every contract in this phase is verified by at least one explicit test added through the Specification-Driven TDD Workflow.
- [ ] The accumulated test suite for Contracts 2.1 through 2.5 covers every documented command outcome and harness behavior.
- [ ] `npm run test:unit` passes.
- [ ] `npm run test:integration` passes.
- [ ] `npm run test:e2e:smoke` passes.
- [ ] `npm run verify:all` passes.

**Jujutsu Checkpoint Subject**: `Phase 2: [describe the test harness and verification commands that were actually completed]`

---

## Phase 3: Schema Evolution for Invitation Lifecycle

### Goal
Extend `list_collaborators` so the schema can represent accepted memberships and pending invitations without breaking existing accepted-collaborator read paths.

### Phase Execution Rules
- Treat this phase as incomplete until every checkbox in the Contract Coverage Checklist for Contracts 3.1 through 3.5 is checked off by the accumulated test suite.
- Treat every contract in this phase as requiring at least one explicit verifying test that was added by following this phase's Specification-Driven TDD Workflow.
- Move in single-behavior loops only: write exactly one new failing contract test, make only the smallest schema, migration, query, or backfill change needed to pass it, then refactor without changing observable behavior.
- Do not stop after the first migration test or first read-path test passes. After each green step, identify the next unchecked invariant, uniqueness rule, or non-effect from this phase and start the next failing test for that specific gap.
- If work resumes mid-phase, begin by listing which Contract Coverage Checklist boxes are already checked, which verifying test satisfies each checked box, and continue with the first unchecked box.

### Specifications

#### Type Definitions
```ts
type AcceptedInvitationStatus = Tagged<"accepted", "AcceptedInvitationStatus">;
type SentInvitationStatus = Tagged<"sent", "SentInvitationStatus">;
type PendingApprovalInvitationStatus = Tagged<
  "pending_approval",
  "PendingApprovalInvitationStatus"
>;
type OpenInvitationStatus =
  | SentInvitationStatus
  | PendingApprovalInvitationStatus;
type RevokedInvitationStatus = Tagged<"revoked", "RevokedInvitationStatus">;
type ExpiredInvitationStatus = Tagged<"expired", "ExpiredInvitationStatus">;
type TerminalInvitationStatus =
  | RevokedInvitationStatus
  | ExpiredInvitationStatus;
type InvitationLifecycleStatus =
  | AcceptedInvitationStatus
  | OpenInvitationStatus
  | TerminalInvitationStatus;

type AcceptedMembershipRow = {
  kind: "accepted_membership";
  invitationId: InvitationId;
  listId: ListId;
  userId: UserId;
  role: UserRole;
  inviteStatus: AcceptedInvitationStatus;
};

type OpenInvitationRow = {
  kind: "open_invitation";
  invitationId: InvitationId;
  listId: ListId;
  userId: null;
  role: UserRole;
  inviteStatus: OpenInvitationStatus;
  invitedEmailNormalized: NormalizedEmailAddress;
  invitationSecretHash: InvitationSecretHash;
  expiresAt: InvitationExpiry;
  inviterId: UserId;
};

type TerminalInvitationRow = {
  kind: "terminal_invitation";
  invitationId: InvitationId;
  listId: ListId;
  userId: null;
  role: UserRole;
  inviteStatus: TerminalInvitationStatus;
  invitedEmailNormalized: NormalizedEmailAddress;
  lastIssuedSecretHash: InvitationSecretHash;
  lastExpiresAt: InvitationExpiry;
  inviterId: UserId;
  resolvedAt: InvitationResolvedAt;
};

type InvitationLifecycleRow =
  | AcceptedMembershipRow
  | OpenInvitationRow
  | TerminalInvitationRow;

type AcceptedCollaborator = ListUser & {
  collaboratorId: InvitationId;
  inviteStatus: AcceptedInvitationStatus;
};

type BackfillReport = {
  scanned: number;
  updated: number;
  unchanged: number;
};
```

#### Contract 3.1: Invitation lifecycle data model
Effects:
- The schema projects invitation rows through `InvitationLifecycleRow`, whose `kind` discriminator and branded `inviteStatus` values rule out mixed accepted/open/terminal states at the type level.
- Rows with `inviteStatus = "accepted"` represent usable collaborator memberships.
- Rows with `inviteStatus = "sent"` or `inviteStatus = "pending_approval"` represent open invitations rather than accepted membership.
- Rows with `inviteStatus = "revoked"` or `inviteStatus = "expired"` are terminal and cannot later be accepted.

#### Contract 3.2: Row invariants for accepted memberships and invitations
Effects:
- Accepted rows must have a non-null `userId`.
- Open invitation rows must have a non-null normalized invited email, non-null token hash, non-null expiry, and non-null inviter id.
- The schema must represent email-only invites by permitting `userId = null` before acceptance.
- Migration and backfill must leave no row in an impossible mixed state for its `inviteStatus`.

#### Contract 3.3: Uniqueness constraints
Effects:
- There is at most one accepted membership for any `(listId, userId)`.
- There is at most one open invite for any `(listId, invitedEmailNormalized)` among open states.
- Terminal invitation rows do not prevent a later new invitation for the same email and list.

#### Contract 3.4: Accepted collaborator queries remain stable
```ts
getCollaborators(listId: ListId): Promise<AcceptedCollaborator[]>
```
Effects:
- Returns only accepted collaborators for `listId`.
- Excludes rows whose `inviteStatus` is `sent`, `pending_approval`, `revoked`, or `expired`.
- Preserves the existing list-page assumption that returned collaborators have an associated concrete user record.

#### Contract 3.5: Legacy data is normalized
```ts
backfillInvitationLifecycleState(): Promise<BackfillReport>
```
Effects:
- Converts legacy collaborator rows into valid `accepted` invitation lifecycle rows.
- After return, no legacy row remains without a valid invitation lifecycle state.
- Running the backfill repeatedly is idempotent.

### Contract Coverage Checklist
Every checkbox below must be checked off only by a TEST that verifies that behavior. Do not check a box based on code inspection, reasoning, or manual belief alone.
#### Contract 3.1 checklist
- [ ] Verifies accepted rows remain usable memberships.
- [ ] Verifies `sent` rows remain non-membership invites.
- [ ] Verifies `pending_approval` rows remain non-membership invites.
- [ ] Verifies `revoked` rows cannot later transition into acceptance.
- [ ] Verifies `expired` rows cannot later transition into acceptance.

#### Contract 3.2 checklist
- [ ] Verifies accepted rows require a non-null `userId`.
- [ ] Verifies open invites require a non-null normalized invited email.
- [ ] Verifies open invites require a non-null token hash.
- [ ] Verifies open invites require a non-null expiry.
- [ ] Verifies open invites require a non-null inviter id.
- [ ] Verifies email-only invites can be represented with `userId = null` before acceptance.
- [ ] Verifies impossible mixed-state rows are rejected or repaired during migration/backfill.

#### Contract 3.3 checklist
- [ ] Verifies there is at most one accepted membership for any `(listId, userId)`.
- [ ] Verifies there is at most one open invite for any `(listId, invitedEmailNormalized)` among open states.
- [ ] Verifies a fresh invite can be issued after a prior invite for the same list and email reaches a terminal state.

#### Contract 3.4 checklist
- [ ] Verifies `getCollaborators` returns only accepted collaborators.
- [ ] Verifies `getCollaborators` excludes `sent` rows.
- [ ] Verifies `getCollaborators` excludes `pending_approval` rows.
- [ ] Verifies `getCollaborators` excludes `revoked` rows.
- [ ] Verifies `getCollaborators` excludes `expired` rows.
- [ ] Verifies returned collaborator rows still have concrete user records.

#### Contract 3.5 checklist
- [ ] Verifies legacy rows are normalized to valid lifecycle states.
- [ ] Verifies no legacy row remains without a lifecycle state after backfill.
- [ ] Verifies rerunning the backfill is idempotent.

### Specification-Driven TDD Workflow
1. `SPEC`: Write Contracts 3.1 and 3.2.
2. `RED`: Add one failing integration test proving fresh-schema rows can represent an email-only invite.
3. `GREEN`: Implement the smallest migration change required.
4. `REFACTOR`: Keep schema naming coherent.
5. `SPEC`: Write Contract 3.3.
6. `RED`: Add one failing integration test proving duplicate open invites for the same list and email are rejected.
7. `GREEN`: Add the minimal uniqueness constraint.
8. `REFACTOR`: Keep index names and helpers readable.
9. `SPEC`: Write Contract 3.4.
10. `RED`: Add one failing integration test proving `getCollaborators` excludes a `sent` invite.
11. `GREEN`: Implement the smallest accepted-only read filter.
12. `REFACTOR`: Centralize accepted-state predicates if useful.
13. `SPEC`: Write Contract 3.5.
14. `RED`: Add one failing integration test proving one legacy row is normalized to `accepted`.
15. `GREEN`: Implement the smallest backfill change.
16. `REFACTOR`: Preserve idempotence and reporting clarity.
17. `COVERAGE`: Before closing the phase, keep adding exactly one failing test at a time until every checkbox in the Contract Coverage Checklist for Contracts 3.1 through 3.5 is checked.

### Files
- `drizzle/schema.ts`
- `drizzle/*.sql` (new migration)
- `drizzle/meta/*` (generated)
- `drizzle/backfillListCollaborators.ts`
- `app/lists/_actions/collaborators.ts`
- `lib/types.ts`
- `tests/integration/invitations/schema-migration.test.ts` (new)

### Phase Gate
- [ ] Every red-green-refactor loop above was completed in order, with one new failing test at a time.
- [ ] Every contract in this phase is verified by at least one explicit test added through the Specification-Driven TDD Workflow.
- [ ] The accumulated integration suite for Contracts 3.1 through 3.5 covers every documented row-state invariant, uniqueness rule, and accepted-read-path behavior.
- [ ] `npm run test:integration` passes.
- [ ] `npm run typecheck` and `npm run lint` pass.

**Jujutsu Checkpoint Subject**: `Phase 3: [describe the schema, backfill, and accepted-read-path changes that were actually completed]`

---

## Phase 4: Invitation Issuing and Send Attempt Workflow

### Goal
Define the end-to-end workflow for inviting someone to a list up to the point where Resend returns its immediate send response.

### Phase Execution Rules
- Treat this phase as incomplete until every checkbox in the Contract Coverage Checklist for Contracts 4.1 through 4.7 is checked off by the accumulated test suite.
- Treat every contract in this phase as requiring at least one explicit verifying test that was added by following this phase's Specification-Driven TDD Workflow.
- Move in single-behavior loops only: write exactly one new failing contract test, make only the smallest workflow, persistence, permission, token, or email-boundary change needed to pass it, then refactor without changing observable behavior.
- Do not stop after the first happy-path invite test passes. After each green step, identify the next unchecked workflow effect, error, send-attempt guarantee, or non-effect from this phase and start the next failing test for that specific gap.
- If work resumes mid-phase, begin by listing which Contract Coverage Checklist boxes are already checked, which verifying test satisfies each checked box, and continue with the first unchecked box.

### Workflow Specification

#### Type Definitions
```ts
type AbsoluteInvitationUrl =
  | Tagged<`http://${string}`, "AbsoluteInvitationUrl">
  | Tagged<`https://${string}`, "AbsoluteInvitationUrl">;

type InvitationSendAcceptedResponse = {
  data: { id: ProviderMessageId };
  error: null;
};

type InvitationSendRejectedResponse = {
  data: null;
  error: {
    message: ResendErrorMessage;
    name?: ResendErrorName;
  };
};

type ResendSendResponse =
  | InvitationSendAcceptedResponse
  | InvitationSendRejectedResponse;

type PersistedSentInvitation = {
  invitationId: InvitationId;
  inviteStatus: SentInvitationStatus;
  expiresAt: InvitationExpiry;
  wasRotated: boolean;
};

type InviteCollaboratorWorkflowResult = {
  invitationId: InvitationId;
  acceptanceUrl: AbsoluteInvitationUrl;
  resendResponse: ResendSendResponse;
};
```

#### Contract 4.1: Invite collaborator workflow
```ts
inviteCollaboratorWorkflow(input: {
  listId: ListId;
  inviterId: UserId;
  invitedEmail: EmailAddress;
  now: Date;
}): Promise<InviteCollaboratorWorkflowResult>
```
Effects:
- Requires `inviterId` to identify a user who is allowed to invite collaborators to `listId`.
- After return, exactly one open invite exists for `(listId, invitedEmailNormalized)`.
- The persisted invite contains a hashed secret, expiry, inviter id, normalized email, and `inviteStatus = "sent"`.
- The returned acceptance URL contains the one-time secret corresponding to the persisted hash.
- The workflow attempts exactly one email send per invocation.
- The workflow returns the raw Resend send response for later interpretation by Phase 5.
- If an open invite already existed for that list and email, previously issued secrets become unusable and the returned secret becomes authoritative.

Throws:
- `InvitationPermissionDeniedError` if `inviterId` is not allowed to invite collaborators to `listId`.
- `ListNotFoundError` if `listId` does not exist.

### Step Specifications

#### Contract 4.2: Invitation permission check
```ts
assertCanInviteCollaborators(input: {
  listId: ListId;
  actorId: UserId;
}): Promise<void>
```
Effects:
- Returns successfully iff `actorId` identifies a user allowed to invite collaborators to `listId`.
- Does not mutate invitation or collaborator state.

Throws:
- `InvitationPermissionDeniedError` if `actorId` is not allowed to invite collaborators to `listId`.

#### Contract 4.3: Invitation secret creation
```ts
createInvitationSecret(): InvitationSecret
```
Effects:
- Returns a non-empty opaque secret suitable for use in an invitation URL.
- The caller can treat the secret as one-time bearer material.

#### Contract 4.4: Invitation secret hashing
```ts
hashInvitationSecret(secret: InvitationSecret): InvitationSecretHash
```
Effects:
- Is deterministic: equal secrets produce equal hashes.
- Is stable across a single deployment for persisted lookup behavior.

#### Contract 4.5: Persist or rotate a single open invite
```ts
issueInvitation(input: {
  listId: ListId;
  inviterId: UserId;
  invitedEmail: EmailAddress;
  secretHash: InvitationSecretHash;
  now: Date;
}): Promise<PersistedSentInvitation>
```
Effects:
- Persists exactly one open invite for `(listId, invitedEmailNormalized)`.
- If an open invite already existed, rotation invalidates the prior secret while preserving the single-open-invite invariant.
- Does not send email.

#### Contract 4.6: Invitation URL construction
```ts
buildInvitationAcceptanceUrl(input: {
  appBaseUrl: AppBaseUrl;
  secret: InvitationSecret;
}): AbsoluteInvitationUrl
```
Effects:
- Returns the canonical app URL for `/invite?token=...`.
- Uses the configured base URL and does not emit a relative URL.

#### Contract 4.7: Resend send attempt
```ts
sendInvitationEmail(input: {
  invitationId: InvitationId;
  acceptanceUrl: AbsoluteInvitationUrl;
}): Promise<ResendSendResponse>
```
Effects:
- Validates required email configuration before attempting provider delivery.
- Attempts exactly one provider send per invocation.
- Returns the raw Resend `{ data, error }` response without translating it into domain state.

### Contract Coverage Checklist
Every checkbox below must be checked off only by a TEST that verifies that behavior. Do not check a box based on code inspection, reasoning, or manual belief alone.
#### Contract 4.1 checklist
- [ ] Verifies `InvitationPermissionDeniedError`.
- [ ] Verifies `ListNotFoundError`.
- [ ] Verifies exactly one open invite exists for `(listId, invitedEmailNormalized)` after success.
- [ ] Verifies the persisted invite stores the hashed secret.
- [ ] Verifies the persisted invite stores the expiry.
- [ ] Verifies the persisted invite stores the inviter id.
- [ ] Verifies the persisted invite stores the normalized email.
- [ ] Verifies the persisted invite stores `inviteStatus = "sent"`.
- [ ] Verifies the returned acceptance URL uses the authoritative one-time secret.
- [ ] Verifies the workflow attempts exactly one email send per invocation.
- [ ] Verifies the raw Resend response is returned unchanged.
- [ ] Verifies rotating an existing open invite makes the previously issued secret unusable.
- [ ] Verifies rotating an existing open invite makes the returned secret authoritative.

#### Contract 4.2 checklist
- [ ] Verifies allowed actors pass the permission check.
- [ ] Verifies denied actors raise `InvitationPermissionDeniedError`.
- [ ] Verifies the permission check does not mutate collaborator state.
- [ ] Verifies the permission check does not mutate invitation state.

#### Contract 4.3 checklist
- [ ] Verifies the generated secret is non-empty.
- [ ] Verifies the caller receives opaque bearer material rather than a structured secret contract.

#### Contract 4.4 checklist
- [ ] Verifies equal secrets hash identically.
- [ ] Verifies persisted lookup behavior remains stable within one deployment.

#### Contract 4.5 checklist
- [ ] Verifies first-time invite persistence.
- [ ] Verifies the single-open-invite invariant is enforced.
- [ ] Verifies issuing over an existing open invite rotates the authoritative secret.
- [ ] Verifies issuing an invite does not send email.

#### Contract 4.6 checklist
- [ ] Verifies the canonical `/invite?token=...` URL is produced.
- [ ] Verifies the returned invitation URL is absolute and based on the configured base URL.

#### Contract 4.7 checklist
- [ ] Verifies required email configuration is validated before provider delivery.
- [ ] Verifies exactly one provider send attempt occurs per invocation.
- [ ] Verifies a successful raw `{ data, error }` response is returned unchanged.
- [ ] Verifies a failed raw `{ data, error }` response is returned unchanged.

### Specification-Driven TDD Workflow
1. `SPEC`: Write Contract 4.2.
2. `RED`: Add one failing unit test proving an unauthorized actor is rejected.
3. `GREEN`: Implement the smallest permission check.
4. `REFACTOR`: Remove duplication from call sites.
5. `SPEC`: Write Contract 4.3.
6. `RED`: Add one failing unit test proving the secret is non-empty.
7. `GREEN`: Implement the smallest secret generator.
8. `REFACTOR`: Keep the secret type opaque.
9. `SPEC`: Write Contract 4.4.
10. `RED`: Add one failing unit test proving identical secrets hash identically.
11. `GREEN`: Implement the smallest hash function.
12. `REFACTOR`: Isolate crypto wiring if needed.
13. `SPEC`: Write Contract 4.5.
14. `RED`: Add one failing unit test proving a new invite record is built with `inviteStatus = "sent"`.
15. `GREEN`: Implement the smallest issue path.
16. `REFACTOR`: Keep rotation logic isolated.
17. `RED`: Add one failing unit test proving an existing open invite rotates to a new authoritative secret.
18. `GREEN`: Implement the smallest rotation behavior.
19. `REFACTOR`: Preserve the single-open-invite invariant.
20. `SPEC`: Write Contract 4.6.
21. `RED`: Add one failing unit test proving the canonical `/invite?token=...` URL is produced.
22. `GREEN`: Implement the smallest URL builder.
23. `REFACTOR`: Centralize URL normalization only if behavior stays unchanged.
24. `SPEC`: Write Contract 4.7.
25. `RED`: Add one failing unit test proving a successful Resend response with `data.id` is surfaced unchanged.
26. `GREEN`: Implement the smallest Resend send wrapper.
27. `REFACTOR`: Keep provider-specific code behind one boundary.
28. `SPEC`: Write Contract 4.1.
29. `RED`: Add one failing integration test proving the whole invite workflow creates one open invite, emits one acceptance URL, and returns a successful raw Resend response.
30. `GREEN`: Compose the existing steps into the workflow for the success path.
31. `REFACTOR`: Remove orchestration duplication without changing observable workflow behavior.
32. `RED`: Add one failing integration test proving the whole invite workflow still creates the invite and returns a failed raw Resend response when the send attempt fails.
33. `GREEN`: Implement the smallest workflow behavior needed for the failed-send path.
34. `REFACTOR`: Keep workflow orchestration consistent across both outcomes.
35. `COVERAGE`: Before closing the phase, keep adding exactly one failing test at a time until every checkbox in the Contract Coverage Checklist for Contracts 4.1 through 4.7 is checked.

### Files
- `lib/invitations/token.ts` (new)
- `lib/invitations/service.ts` (new)
- `app/lists/_actions/invitations.ts` (new)
- `app/lists/_actions/permissions.ts`
- `lib/email/resend.ts` (new)
- `app/emails/invitation-email.tsx` (new)
- `tests/unit/invitations/*.test.ts` (new)
- `tests/integration/invitations/service.test.ts` (new)

### Phase Gate
- [ ] Every red-green-refactor loop above was completed in order, with one new failing test at a time.
- [ ] Every contract in this phase is verified by at least one explicit test added through the Specification-Driven TDD Workflow.
- [ ] The accumulated unit and integration suites for Contracts 4.1 through 4.7 cover every documented output, error case, and side effect, including both successful and failed send-attempt outcomes.
- [ ] `npm run test:unit` passes.
- [ ] `npm run test:integration` passes.
- [ ] `npm run typecheck` and `npm run lint` pass.

**Jujutsu Checkpoint Subject**: `Phase 4: [describe the invitation issuing and send-attempt workflow that was actually completed]`

---

## Phase 5: Resend Delivery Response and Webhook Authentication Workflow

### Goal
Interpret Resend's immediate send responses, persist delivery outcomes, and authenticate webhook events before they can mutate invitation delivery state.

### Phase Execution Rules
- Treat this phase as incomplete until every checkbox in the Contract Coverage Checklist for Contracts 5.1 through 5.7 is checked off by the accumulated test suite.
- Treat every contract in this phase as requiring at least one explicit verifying test that was added by following this phase's Specification-Driven TDD Workflow.
- Move in single-behavior loops only: write exactly one new failing contract test, make only the smallest normalization, persistence, verification, or route change needed to pass it, then refactor without changing observable behavior.
- Do not stop after the first successful send-response or signed-webhook test passes. After each green step, identify the next unchecked delivery outcome, verification outcome, or persistence guarantee from this phase and start the next failing test for that specific gap.
- If work resumes mid-phase, begin by listing which Contract Coverage Checklist boxes are already checked, which verifying test satisfies each checked box, and continue with the first unchecked box.

### Resend Research Notes
- The official Resend send API returns an object shaped like `{ data, error }`.
- A successful response includes `data.id`, which identifies the provider-side email message.
- A failed response includes `error`, whose message must be persisted so invitation delivery failures are diagnosable.
- Resend webhook authentication uses the raw request body, the `svix-id`, `svix-timestamp`, and `svix-signature` headers, and the webhook signing secret.
- Delivery-response handling in this phase must support at least `email.failed`, `email.bounced`, `email.delivery_delayed`, and `email.complained`.

### Type Definitions

```ts
type ResendWebhookHeaders = {
  "svix-id": Tagged<string, "ResendSvixId">;
  "svix-timestamp": Tagged<string, "ResendSvixTimestamp">;
  "svix-signature": Tagged<string, "ResendSvixSignature">;
};

type SupportedResendWebhookEventType = Tagged<
  | "email.failed"
  | "email.bounced"
  | "email.delivery_delayed"
  | "email.complained",
  "SupportedResendWebhookEventType"
>;

type UnsupportedResendWebhookEventType = Tagged<
  string,
  "UnsupportedResendWebhookEventType"
>;

type ResendWebhookEventType =
  | SupportedResendWebhookEventType
  | UnsupportedResendWebhookEventType;

type SupportedResendWebhookEvent = {
  type: SupportedResendWebhookEventType;
  data: {
    email_id: ProviderMessageId;
  };
};

type UnsupportedResendWebhookEvent = {
  type: UnsupportedResendWebhookEventType;
  data: {
    email_id?: ProviderMessageId | null;
  };
};

type ResendWebhookEvent =
  | SupportedResendWebhookEvent
  | UnsupportedResendWebhookEvent;

type InvitationDeliveryResult =
  | { kind: "accepted_for_delivery"; providerMessageId: ProviderMessageId }
  | {
      kind: "send_failed";
      providerErrorMessage: ResendErrorMessage;
      providerErrorName?: ResendErrorName;
    };

type AuthenticatedWebhookResult = {
  verifiedEventType: ResendWebhookEventType;
  persistence: "updated" | "ignored";
};
```

### Workflow Specifications

#### Contract 5.1: Immediate Resend response handling workflow
```ts
handleInvitationSendResponseWorkflow(input: {
  invitationId: InvitationId;
  resendResponse: ResendSendResponse;
  attemptedAt: DeliveryAttemptedAt;
}): Promise<InvitationDeliveryResult>
```
Effects:
- Interprets the raw Resend `{ data, error }` response according to the official API contract.
- If `data.id` is present and `error` is null, persists a delivery-attempt result correlated to `invitationId`.
- If `error` is present, persists the failure details correlated to `invitationId`.
- Does not accept, revoke, or otherwise change invitation-recipient state.

#### Contract 5.2: Authenticated Resend webhook handling workflow
```ts
handleAuthenticatedResendWebhookWorkflow(input: {
  rawBody: string;
  headers: ResendWebhookHeaders;
}): Promise<AuthenticatedWebhookResult>
```
Effects:
- Rejects webhook requests whose signature cannot be verified from the raw body, `svix-*` headers, and configured signing secret.
- Accepts supported delivery events and persists their delivery metadata when they can be correlated to a previously recorded provider message id.
- Returns `"ignored"` when the event is valid but does not correlate to a known invitation delivery record.

### Step Specifications

#### Contract 5.3: Resend send-response normalization
```ts
normalizeResendSendResponse(
  response: ResendSendResponse,
): InvitationDeliveryResult
```
Effects:
- Maps the official Resend `{ data, error }` shape into the invitation domain result.
- Rejects impossible mixed states where both success and failure fields appear populated.

#### Contract 5.4: Invitation delivery-attempt persistence
```ts
recordInvitationSendResult(input: {
  invitationId: InvitationId;
  result: InvitationDeliveryResult;
  attemptedAt: DeliveryAttemptedAt;
}): Promise<void>
```
Effects:
- Persists the normalized immediate send outcome for `invitationId`.
- Stores the provider message id for later webhook correlation when the send was accepted for delivery.
- Stores provider failure details when the send failed immediately.

#### Contract 5.5: Resend webhook signature verification
```ts
verifyResendWebhookSignature(input: {
  rawBody: string;
  headers: ResendWebhookHeaders;
  signingSecret: ResendWebhookSecret;
}): ResendWebhookEvent
```
Effects:
- Verifies the webhook signature using the raw body and `svix-*` headers.
- Returns the verified event payload on success.

Throws:
- `InvalidWebhookSignatureError` if the signature is missing or invalid.

#### Contract 5.6: Webhook delivery-event persistence
```ts
recordInvitationDeliveryEvent(input: {
  event: ResendWebhookEvent;
}): Promise<"updated" | "ignored">
```
Effects:
- Persists supported Resend delivery events when the event can be correlated through the provider message id.
- Supports at least `email.failed`, `email.bounced`, `email.delivery_delayed`, and `email.complained`.
- Returns `"ignored"` for verified but uncorrelatable or unsupported events.

#### Contract 5.7: Webhook route behavior
```ts
handleResendWebhookRequest(request: Request): Promise<Response>
```
Effects:
- Reads the raw request body without destroying the ability to verify the signature.
- Uses Contract 5.5 before any invitation-delivery mutation occurs.
- Returns a non-success response for invalid signatures and malformed payloads.

### Contract Coverage Checklist
Every checkbox below must be checked off only by a TEST that verifies that behavior. Do not check a box based on code inspection, reasoning, or manual belief alone.
#### Contract 5.1 checklist
- [ ] Verifies an accepted-for-delivery response is normalized correctly.
- [ ] Verifies an accepted-for-delivery response is persisted against the invitation.
- [ ] Verifies a send-failed response is normalized correctly.
- [ ] Verifies a send-failed response is persisted against the invitation.
- [ ] Verifies immediate response handling does not mutate invitation-recipient state.

#### Contract 5.2 checklist
- [ ] Verifies invalid signatures are rejected.
- [ ] Verifies supported events are persisted after successful verification.
- [ ] Verifies valid but uncorrelatable events return `"ignored"`.

#### Contract 5.3 checklist
- [ ] Verifies successful normalization of `{ data: { id }, error: null }`.
- [ ] Verifies failed normalization of `{ data: null, error }`.
- [ ] Verifies impossible mixed `{ data, error }` states are rejected.

#### Contract 5.4 checklist
- [ ] Verifies provider message ids are stored for accepted-for-delivery results.
- [ ] Verifies provider failure details are stored for immediate send failures.

#### Contract 5.5 checklist
- [ ] Verifies successful signature verification returns the event payload.
- [ ] Verifies missing signature material raises `InvalidWebhookSignatureError`.
- [ ] Verifies invalid signature material raises `InvalidWebhookSignatureError`.

#### Contract 5.6 checklist
- [ ] Verifies `email.failed` events are persisted when correlatable.
- [ ] Verifies `email.bounced` events are persisted when correlatable.
- [ ] Verifies `email.delivery_delayed` events are persisted when correlatable.
- [ ] Verifies `email.complained` events are persisted when correlatable.
- [ ] Verifies unsupported verified events return `"ignored"`.
- [ ] Verifies uncorrelatable verified events return `"ignored"`.

#### Contract 5.7 checklist
- [ ] Verifies the route reads the raw body in a way that preserves signature verification.
- [ ] Verifies signature verification occurs before any invitation-delivery mutation.
- [ ] Verifies invalid signatures return a non-success response.
- [ ] Verifies malformed payloads return a non-success response.

### Specification-Driven TDD Workflow
1. `SPEC`: Write Contract 5.3.
2. `RED`: Add one failing unit test proving a successful Resend response with `data.id` normalizes to `accepted_for_delivery`.
3. `GREEN`: Implement the smallest success normalization.
4. `REFACTOR`: Keep provider-to-domain mapping explicit.
5. `RED`: Add one failing unit test proving a Resend `error` normalizes to `send_failed`.
6. `GREEN`: Implement the smallest failure normalization.
7. `REFACTOR`: Preserve impossible-state checks.
8. `SPEC`: Write Contract 5.4.
9. `RED`: Add one failing unit test proving an accepted-for-delivery result persists the provider message id.
10. `GREEN`: Implement the smallest persistence path.
11. `REFACTOR`: Keep delivery-attempt storage isolated.
12. `RED`: Add one failing unit test proving an immediate send failure persists provider error details.
13. `GREEN`: Implement the smallest failure persistence path.
14. `REFACTOR`: Preserve correlation semantics.
15. `SPEC`: Write Contract 5.1.
16. `RED`: Add one failing integration test proving an accepted-for-delivery Resend response persists the provider message id against the invitation after one send attempt.
17. `GREEN`: Compose the smallest immediate-response workflow for the accepted-for-delivery path.
18. `REFACTOR`: Keep phase-4 send attempts decoupled from phase-5 interpretation.
19. `RED`: Add one failing integration test proving a Resend send failure is persisted against the invitation after one send attempt.
20. `GREEN`: Implement the smallest immediate-response workflow for the failed-send path.
21. `REFACTOR`: Keep success and failure correlation behavior consistent.
22. `SPEC`: Write Contract 5.5.
23. `RED`: Add one failing unit test proving an invalid `svix-signature` is rejected.
24. `GREEN`: Implement the smallest signature verification path.
25. `REFACTOR`: Keep raw-body handling explicit.
26. `SPEC`: Write Contract 5.6.
27. `RED`: Add one failing unit test proving a verified `email.bounced` event updates the correlated invitation delivery record.
28. `GREEN`: Implement the smallest event-persistence path.
29. `REFACTOR`: Keep supported event mapping explicit.
30. `SPEC`: Write Contracts 5.2 and 5.7.
31. `RED`: Add one failing integration test proving a signed webhook request updates the correlated invitation delivery record.
32. `GREEN`: Implement the smallest authenticated webhook route.
33. `REFACTOR`: Keep webhook verification and persistence loosely coupled.
34. `COVERAGE`: Before closing the phase, keep adding exactly one failing test at a time until every checkbox in the Contract Coverage Checklist for Contracts 5.1 through 5.7 is checked.

### Files
- `lib/email/resend.ts`
- `app/api/webhooks/resend/route.ts` (new)
- `lib/invitations/service.ts`
- `app/lists/_actions/invitations.ts`
- `tests/unit/invitations/resend-response.test.ts` (new)
- `tests/integration/invitations/delivery-response.test.ts` (new)

### Phase Gate
- [ ] Every red-green-refactor loop above was completed in order, with one new failing test at a time.
- [ ] Every contract in this phase is verified by at least one explicit test added through the Specification-Driven TDD Workflow.
- [ ] The accumulated unit and integration suites for Contracts 5.1 through 5.7 cover every documented successful and failed immediate-send outcome, signature-verification outcome, supported webhook event, and persistence side effect.
- [ ] `npm run test:unit` passes.
- [ ] `npm run test:integration` passes.
- [ ] `npm run typecheck` and `npm run lint` pass.

**Jujutsu Checkpoint Subject**: `Phase 5: [describe the Resend response handling and authenticated webhook workflow that was actually completed]`

---

## Phase 6: Invitation Acceptance and Auth Continuation Workflow

### Goal
Define the end-to-end workflow for consuming an invite link across logged-out, matched-email, mismatched-email, and terminal invite states.

### Phase Execution Rules
- Treat this phase as incomplete until every checkbox in the Contract Coverage Checklist for Contracts 6.1 through 6.5 is checked off by the accumulated test suite.
- Treat every contract in this phase as requiring at least one explicit verifying test that was added by following this phase's Specification-Driven TDD Workflow.
- Move in single-behavior loops only: write exactly one new failing contract test, make only the smallest acceptance, redirect, persistence, or route change needed to pass it, then refactor without changing observable behavior.
- Do not stop after the first acceptance-path or sign-in-continuation test passes. After each green step, identify the next unchecked invite outcome, redirect guarantee, or non-effect from this phase and start the next failing test for that specific gap.
- If work resumes mid-phase, begin by listing which Contract Coverage Checklist boxes are already checked, which verifying test satisfies each checked box, and continue with the first unchecked box.

### Workflow Specification

#### Type Definitions
```ts
type AcceptedInvitationResolution = {
  kind: "accepted";
  listId: ListId;
};

type PendingApprovalInvitationResolution = {
  kind: "pending_approval";
  listId: ListId;
};

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
acceptInvitationWorkflow(input: {
  invitationSecret: InvitationSecret;
  viewer: AuthenticatedUser | null;
  now: Date;
}): Promise<AcceptInvitationWorkflowResult>
```
Effects:
- If the secret does not identify an open invitation, returns the correct terminal outcome without mutating unrelated invitations.
- If the invitation is open and `viewer` is `null`, returns `redirect_to_sign_in` with a safe path that resumes the same invite URL after sign-in.
- If the invitation is open and `viewer.email` matches the invited email, accepts the invitation and makes collaborator access observable immediately after success.
- If the invitation is open and `viewer.email` does not match the invited email, moves the invitation to `pending_approval`.
- Reusing a consumed, revoked, or expired invitation secret does not create a second acceptance.

### Step Specifications

#### Contract 6.2: Safe redirect target normalization
```ts
normalizeRedirectTarget(value: string | null): SafeAppPath
```
Effects:
- Returns a safe app-relative path when `value` names an internal path.
- Rejects absolute URLs, cross-origin targets, and malformed redirect targets by returning the default safe path.
- Prevents invite continuation from introducing an open redirect.

#### Contract 6.3: Sign-in continuation target creation
```ts
buildInviteContinuationTarget(secret: InvitationSecret): SafeAppPath
```
Effects:
- Returns the safe app-relative invite URL needed to resume the same invitation after sign-in.
- Does not emit cross-origin or absolute URLs.

#### Contract 6.4: Invitation resolution
```ts
resolveInviteAcceptance(input: {
  invitationSecret: InvitationSecret;
  viewer: AuthenticatedUser;
  now: Date;
}): Promise<ResolveInviteAcceptanceResult>
```
Effects:
- Accepts on exact email match.
- Moves mismatched authenticated viewers to `pending_approval`.
- Returns the correct terminal outcome for invalid, expired, revoked, or already resolved invitations.

#### Contract 6.5: Invite page outcome rendering
Effects:
- `/invite?token=...` renders an explicit user-facing state for every `InvitePageOutcome`: `invalid`, `expired`, `revoked`, `already_resolved`, and `pending_approval`.
- The page does not silently redirect away from those terminal states.

### Contract Coverage Checklist
Every checkbox below must be checked off only by a TEST that verifies that behavior. Do not check a box based on code inspection, reasoning, or manual belief alone.
#### Contract 6.1 checklist
- [ ] Verifies invalid secrets return the correct terminal outcome.
- [ ] Verifies invalid-secret handling does not mutate unrelated invitations.
- [ ] Verifies logged-out viewers receive a sign-in redirect with a safe continuation target.
- [ ] Verifies matching-email viewers accept the invitation successfully.
- [ ] Verifies matching-email acceptance makes collaborator access observable immediately.
- [ ] Verifies mismatched-email viewers transition the invitation to `pending_approval`.
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
- [ ] Verifies the `accepted` outcome.
- [ ] Verifies the `pending_approval` outcome.
- [ ] Verifies the `invalid` outcome.
- [ ] Verifies the `expired` outcome.
- [ ] Verifies the `revoked` outcome.
- [ ] Verifies the `already_resolved` outcome.

#### Contract 6.5 checklist
- [ ] Verifies the invite page renders an explicit `invalid` state.
- [ ] Verifies the invite page renders an explicit `expired` state.
- [ ] Verifies the invite page renders an explicit `revoked` state.
- [ ] Verifies the invite page renders an explicit `already_resolved` state.
- [ ] Verifies the invite page renders an explicit `pending_approval` state.
- [ ] Verifies the invite page does not silently redirect away from those outcomes.

### Specification-Driven TDD Workflow
1. `SPEC`: Write Contract 6.2.
2. `RED`: Add one failing unit test proving an absolute redirect target is rejected.
3. `GREEN`: Implement the smallest safe-path normalization.
4. `REFACTOR`: Keep redirect logic centralized.
5. `SPEC`: Write Contract 6.3.
6. `RED`: Add one failing unit test proving invite continuation preserves the same token path.
7. `GREEN`: Implement the smallest continuation target builder.
8. `REFACTOR`: Remove string-building duplication.
9. `SPEC`: Write Contract 6.4.
10. `RED`: Add one failing unit test proving exact email match resolves to `accepted`.
11. `GREEN`: Implement the smallest match-acceptance branch.
12. `REFACTOR`: Keep state mapping declarative.
13. `RED`: Add one failing unit test proving mismatched email resolves to `pending_approval`.
14. `GREEN`: Implement the smallest mismatch branch.
15. `REFACTOR`: Preserve terminal-state behavior.
16. `RED`: Add one failing unit test for one terminal state, starting with `expired`.
17. `GREEN`: Implement the smallest terminal-state resolution needed for that test.
18. `REFACTOR`: Repeat one test at a time for `invalid`, `revoked`, and `already_resolved`.
19. `SPEC`: Write Contract 6.1.
20. `RED`: Add one failing integration test proving logged-out viewers are redirected to sign-in with a safe continuation target.
21. `GREEN`: Compose the workflow for logged-out handling.
22. `REFACTOR`: Keep auth handoff isolated.
23. `RED`: Add one failing integration test proving matching-email acceptance grants collaborator access.
24. `GREEN`: Implement the smallest persistence path for successful acceptance.
25. `REFACTOR`: Preserve one-time token behavior.
26. `RED`: Add one failing integration test proving mismatched authenticated viewers become `pending_approval`.
27. `GREEN`: Implement the smallest mismatch persistence path.
28. `REFACTOR`: Keep state transitions coherent.
29. `SPEC`: Write Contract 6.5.
30. `RED`: Add one failing e2e test proving the logged-out browser flow resumes the same invite after sign-in.
31. `GREEN`: Implement the smallest route and sign-in wiring needed for the browser flow.
32. `REFACTOR`: Simplify route mapping without changing outcomes.
33. `COVERAGE`: Before closing the phase, keep adding exactly one failing test at a time until every checkbox in the Contract Coverage Checklist for Contracts 6.1 through 6.5 is checked.

### Files
- `app/invite/page.tsx` (new)
- `app/lists/_actions/invitations.ts`
- `app/sign-in/page.tsx`
- `app/sign-in/_components/sign-in.tsx`
- `tests/unit/invitations/*.test.ts` (new)
- `tests/integration/invitations/acceptance.test.ts` (new)
- `tests/e2e/invitations/acceptance.spec.ts` (new)

### Phase Gate
- [ ] Every red-green-refactor loop above was completed in order, with one new failing test at a time.
- [ ] Every contract in this phase is verified by at least one explicit test added through the Specification-Driven TDD Workflow.
- [ ] The accumulated unit, integration, and e2e suites for Contracts 6.1 through 6.5 cover every documented invite-acceptance outcome, redirect outcome, and side effect.
- [ ] `npm run test:unit` passes.
- [ ] `npm run test:integration` passes.
- [ ] `npm run test:e2e:smoke` passes.
- [ ] `npm run typecheck` and `npm run lint` pass.

**Jujutsu Checkpoint Subject**: `Phase 6: [describe the invitation acceptance and sign-in continuation workflow that was actually completed]`

---

## Phase 7: Collaborator Management Workflow and UX

### Goal
Define the end-to-end workflow for users who are allowed to manage collaborators so they can view collaborator state and act on invitations without introducing authorization leaks or N+1 query behavior.

### Phase Execution Rules
- Treat this phase as incomplete until every checkbox in the Contract Coverage Checklist for Contracts 7.1 through 7.6 is checked off by the accumulated test suite.
- Treat every contract in this phase as requiring at least one explicit verifying test that was added by following this phase's Specification-Driven TDD Workflow.
- Move in single-behavior loops only: write exactly one new failing contract test, make only the smallest permission, data-loading, workflow, or UI wiring change needed to pass it, then refactor without changing observable behavior.
- Do not stop after the first management-page or first action-wiring test passes. After each green step, identify the next unchecked authorization rule, view-data guarantee, action-availability rule, or UI outcome from this phase and start the next failing test for that specific gap.
- If work resumes mid-phase, begin by listing which Contract Coverage Checklist boxes are already checked, which verifying test satisfies each checked box, and continue with the first unchecked box.

### Workflow Specification

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
};

type InvitationSummary =
  | SentInvitationSummary
  | PendingApprovalInvitationSummary;

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

type SentInvitationAction = Extract<
  InvitationAction,
  { kind: "resend" | "revoke" | "copy_link" }
>;

type PendingApprovalInvitationAction = Extract<
  InvitationAction,
  { kind: "approve" | "reject" }
>;

type CollaboratorManagementListView = {
  list: ListWithRole;
  acceptedCollaborators: ReadonlyArray<AcceptedCollaborator>;
  invitations: ReadonlyArray<InvitationSummary>;
};

type CollaboratorManagementViewData = {
  manageableLists: ReadonlyArray<CollaboratorManagementListView>;
};
```

#### Contract 7.1: Collaborator management workflow
```ts
loadCollaboratorManagementWorkflow(input: {
  actorId: UserId;
}): Promise<CollaboratorManagementViewData>
```
Effects:
- Requires `actorId` to identify a user who is allowed to manage collaborators for each returned list.
- Returns the accepted collaborators, open invites, and `pending_approval` entries needed to render both the list-level manager and the cross-list management page.
- Excludes lists for which `actorId` is not allowed to manage collaborators.
- Returns enough data to drive resend, revoke, copy-link, approve, and reject actions from server-authoritative state.

### Step Specifications

#### Contract 7.2: Collaborator-management permission check
```ts
assertCanManageCollaborators(input: {
  listId: ListId;
  actorId: UserId;
}): Promise<void>
```
Effects:
- Returns successfully iff `actorId` identifies a user allowed to manage collaborators for `listId`.
- Does not mutate collaborator or invitation state.

Throws:
- `CollaboratorManagementPermissionDeniedError` if `actorId` is not allowed to manage collaborators for `listId`.

#### Contract 7.3: Collaborator management view-data loader
```ts
getCollaboratorManagementViewData(input: {
  actorId: UserId;
}): Promise<CollaboratorManagementViewData>
```
Effects:
- Returns all lists, accepted collaborators, open invites, and `pending_approval` entries manageable by `actorId`.
- Executes in a bounded number of database queries with respect to the number of returned lists; it must not perform one additional query per list.
- Preserves server-authoritative identifiers needed for invitation actions.

#### Contract 7.4: Invitation action availability mapping
```ts
getAvailableInvitationActions<
  TInvitation extends InvitationSummary,
>(input: {
  invitation: TInvitation;
  actorCapabilities: ActorCollaboratorCapabilities;
}): ReadonlyArray<
  TInvitation extends PendingApprovalInvitationSummary
    ? PendingApprovalInvitationAction
    : SentInvitationAction
>
```
Effects:
- Returns only the actions valid for the invitation's current state and the actor's capabilities.
- Does not include actions the actor is not allowed to perform.

#### Contract 7.5: Collaborator management route behavior
Effects:
- `/lists/collaborators` renders the workflow data from Contract 7.1 for an authenticated user allowed to manage at least one list.
- Unauthenticated users are redirected to sign-in.
- Authenticated users who cannot manage collaborators for any list do not receive collaborator-management data for unauthorized lists.

#### Contract 7.6: UI actions preserve server authority
Effects:
- Send, resend, revoke, approve, reject, and copy-link flows use the server contracts from Phases 4, 5, and 6 as the source of truth.
- Client code does not assume a state transition succeeded until the corresponding server contract reports success.

### Contract Coverage Checklist
Every checkbox below must be checked off only by a TEST that verifies that behavior. Do not check a box based on code inspection, reasoning, or manual belief alone.
#### Contract 7.1 checklist
- [ ] Verifies the workflow returns only lists manageable by the actor.
- [ ] Verifies the workflow includes accepted collaborators needed for management views.
- [ ] Verifies the workflow includes open invites needed for management views.
- [ ] Verifies the workflow includes `pending_approval` invites needed for management views.
- [ ] Verifies the returned state is sufficient to drive resend actions.
- [ ] Verifies the returned state is sufficient to drive revoke actions.
- [ ] Verifies the returned state is sufficient to drive copy-link actions.
- [ ] Verifies the returned state is sufficient to drive approve actions.
- [ ] Verifies the returned state is sufficient to drive reject actions.

#### Contract 7.2 checklist
- [ ] Verifies allowed actors pass the collaborator-management permission check.
- [ ] Verifies denied actors raise `CollaboratorManagementPermissionDeniedError`.
- [ ] Verifies the permission check does not mutate collaborator state.
- [ ] Verifies the permission check does not mutate invitation state.

#### Contract 7.3 checklist
- [ ] Verifies manageable-list data loading includes all required manageable lists.
- [ ] Verifies manageable-list data loading includes accepted collaborators.
- [ ] Verifies manageable-list data loading includes open invites.
- [ ] Verifies manageable-list data loading includes `pending_approval` invites.
- [ ] Verifies query count remains bounded as the number of manageable lists grows.
- [ ] Verifies unauthorized lists are excluded.
- [ ] Verifies authoritative identifiers needed for later actions are preserved.

#### Contract 7.4 checklist
- [ ] Verifies available actions are constrained by invitation state.
- [ ] Verifies available actions are constrained by actor capability.
- [ ] Verifies forbidden actions are never offered.

#### Contract 7.5 checklist
- [ ] Verifies unauthenticated users are redirected to sign-in.
- [ ] Verifies authenticated managers see the collaborator-management route rendered with authorized data.
- [ ] Verifies authenticated users without access do not receive unauthorized collaborator-management data.

#### Contract 7.6 checklist
- [ ] Verifies send flows remain server-authoritative from initiation through visible UI outcome.
- [ ] Verifies resend flows remain server-authoritative from initiation through visible UI outcome.
- [ ] Verifies revoke flows remain server-authoritative from initiation through visible UI outcome.
- [ ] Verifies approve flows remain server-authoritative from initiation through visible UI outcome.
- [ ] Verifies reject flows remain server-authoritative from initiation through visible UI outcome.
- [ ] Verifies copy-link flows remain server-authoritative from initiation through visible UI outcome.

### Specification-Driven TDD Workflow
1. `SPEC`: Write Contract 7.2.
2. `RED`: Add one failing unit test proving an unauthorized actor is denied collaborator-management capability for one list.
3. `GREEN`: Implement the smallest permission check.
4. `REFACTOR`: Keep authorization boundaries explicit.
5. `SPEC`: Write Contract 7.4.
6. `RED`: Add one failing unit test proving a `pending_approval` invitation exposes `approve` and `reject` but not `resend`.
7. `GREEN`: Implement the smallest action-availability mapping.
8. `REFACTOR`: Keep UI action rules declarative.
9. `SPEC`: Write Contract 7.3.
10. `RED`: Add one failing integration test proving the management data loader returns accepted collaborators and open invites for one manageable list.
11. `GREEN`: Implement the smallest data loader.
12. `REFACTOR`: Keep view-model shaping separate from queries.
13. `RED`: Add one failing integration test proving the loader excludes one unauthorized list.
14. `GREEN`: Tighten authorization filtering.
15. `REFACTOR`: Remove duplicated predicates.
16. `RED`: Add one failing integration test proving query count stays bounded as the number of manageable lists increases.
17. `GREEN`: Eliminate the N+1 path in the data loader.
18. `REFACTOR`: Keep query shaping readable and stable.
19. `SPEC`: Write Contract 7.1.
20. `RED`: Add one failing integration test proving the full workflow data can drive both list-level and cross-list management views.
21. `GREEN`: Compose the workflow data contract from the existing steps.
22. `REFACTOR`: Remove orchestration duplication.
23. `SPEC`: Write Contracts 7.5 and 7.6.
24. `RED`: Add one failing e2e test proving an allowed manager can resend an invite from the UI.
25. `GREEN`: Implement the smallest UI wiring for resend.
26. `REFACTOR`: Keep action wiring thin.
27. `RED`: Add one failing e2e test proving an allowed manager can approve a `pending_approval` invite.
28. `GREEN`: Implement the smallest UI wiring for approval.
29. `REFACTOR`: Repeat one test at a time for revoke, reject, and copy-link flows.
30. `COVERAGE`: Before closing the phase, keep adding exactly one failing test at a time until every checkbox in the Contract Coverage Checklist for Contracts 7.1 through 7.6 is checked.

### Files
- `app/lists/_components/manage-collaborators.tsx`
- `app/lists/_components/list.tsx`
- `app/lists/collaborators/page.tsx` (new)
- `app/lists/_components/user-lists.tsx`
- `app/lists/page.tsx`
- `tests/unit/invitations/*.test.ts` (new)
- `tests/integration/invitations/collaborator-management-actions.test.ts` (new)
- `tests/e2e/invitations/collaborator-management.spec.ts` (new)

### Phase Gate
- [ ] Every red-green-refactor loop above was completed in order, with one new failing test at a time.
- [ ] Every contract in this phase is verified by at least one explicit test added through the Specification-Driven TDD Workflow.
- [ ] The accumulated unit, integration, and e2e suites for Contracts 7.1 through 7.6 cover every documented authorization rule, view-data rule, action-availability rule, bounded-query requirement, and UI action outcome.
- [ ] `npm run test:unit` passes.
- [ ] `npm run test:integration` passes.
- [ ] `npm run test:e2e:smoke` passes.
- [ ] `npm run typecheck` and `npm run lint` pass.

**Jujutsu Checkpoint Subject**: `Phase 7: [describe the collaborator-management workflow and UI that were actually completed]`

---

## Phase 8: Lifecycle and Release-Hardening Workflows

### Goal
Define the workflows that invalidate invitation state when list lifecycle changes occur and finalize the release gate around those contracts.

### Phase Execution Rules
- Treat this phase as incomplete until every checkbox in the Contract Coverage Checklist for Contracts 8.1 through 8.4 is checked off by the accumulated test suite.
- Treat every contract in this phase as requiring at least one explicit verifying test that was added by following this phase's Specification-Driven TDD Workflow.
- Move in single-behavior loops only: write exactly one new failing contract test, make only the smallest lifecycle, invalidation, verification, or documentation change needed to pass it, then refactor without changing observable behavior.
- Do not stop after the first archive or delete invalidation test passes. After each green step, identify the next unchecked invalidation guarantee, non-effect, or release-gate requirement from this phase and start the next failing test for that specific gap.
- If work resumes mid-phase, begin by listing which Contract Coverage Checklist boxes are already checked, which verifying test satisfies each checked box, and continue with the first unchecked box.

### Workflow Specifications

#### Type Definitions
```ts
type InvitationInvalidationTerminalStatus =
  | RevokedInvitationStatus
  | ExpiredInvitationStatus;
```

#### Contract 8.1: Archive workflow invalidates open invites
```ts
archiveListWorkflow(input: {
  listId: ListId;
  actorId: UserId;
}): Promise<List>
```
Effects:
- If the archive succeeds, then every open invite for `listId` is moved to a terminal non-accepting state before the caller can observe archive success.
- Accepted collaborator memberships remain accepted after archive.
- No unrelated list's invitations are modified.

#### Contract 8.2: Delete workflow invalidates invite secrets before removal
```ts
deleteListWorkflow(input: {
  listId: ListId;
  actorId: UserId;
}): Promise<void>
```
Effects:
- If the delete succeeds, then any previously issued invitation secret for `listId` becomes unusable.
- The delete path does not allow a race where a token remains valid after successful deletion.

### Step Specifications

#### Contract 8.3: Invalidate open invites for one list
```ts
invalidateOpenInvitesForList(input: {
  listId: ListId;
  now: Date;
  terminalStatus: InvitationInvalidationTerminalStatus;
}): Promise<number>
```
Effects:
- Moves every open invite for `listId` to `terminalStatus`.
- Does not modify accepted collaborators or invitations belonging to other lists.

#### Contract 8.4: Release gate and runbook
Effects:
- `npm run verify:all` remains the sole release gate.
- The release runbook documents required env vars, schema migration order, backfill order, rollback switch, and email-delivery troubleshooting steps.

### Contract Coverage Checklist
Every checkbox below must be checked off only by a TEST that verifies that behavior. Do not check a box based on code inspection, reasoning, or manual belief alone.
#### Contract 8.1 checklist
- [ ] Verifies archive success is not observable before all open invites for the archived list reach a terminal state.
- [ ] Verifies accepted collaborators remain accepted after archive.
- [ ] Verifies unrelated lists are untouched by archive-time invite invalidation.

#### Contract 8.2 checklist
- [ ] Verifies previously issued invitation secrets become unusable after delete success.
- [ ] Verifies the delete workflow does not leave a post-success token-validity race.

#### Contract 8.3 checklist
- [ ] Verifies every open invite for the target list is moved to the requested terminal state.
- [ ] Verifies accepted collaborators are left unchanged by invalidation.
- [ ] Verifies invitations for other lists are left unchanged by invalidation.

#### Contract 8.4 checklist
- [ ] Verifies `npm run verify:all` remains the sole release gate.
- [ ] Verifies the runbook documents required env vars.
- [ ] Verifies the runbook documents schema migration order.
- [ ] Verifies the runbook documents backfill order.
- [ ] Verifies the runbook documents the rollback switch.
- [ ] Verifies the runbook documents email-delivery troubleshooting steps.

### Specification-Driven TDD Workflow
1. `SPEC`: Write Contract 8.3.
2. `RED`: Add one failing unit test proving one open invite is moved to `revoked`.
3. `GREEN`: Implement the smallest invalidation helper.
4. `REFACTOR`: Keep terminal-state logic isolated.
5. `RED`: Add one failing unit test proving accepted collaborators are untouched by invalidation.
6. `GREEN`: Tighten invalidation filtering.
7. `REFACTOR`: Preserve list scoping.
8. `SPEC`: Write Contract 8.1.
9. `RED`: Add one failing integration test proving archive success is not observable while an open invite remains open.
10. `GREEN`: Compose the smallest archive workflow change.
11. `REFACTOR`: Keep archive orchestration readable.
12. `SPEC`: Write Contract 8.2.
13. `RED`: Add one failing integration test proving a previously issued token cannot be used after delete.
14. `GREEN`: Implement the smallest delete invalidation path.
15. `REFACTOR`: Preserve delete ordering guarantees.
16. `SPEC`: Write Contract 8.4.
17. `RED`: Add one failing verification or documentation check for a missing runbook element.
18. `GREEN`: Update `verify:all` and the runbook.
19. `REFACTOR`: Keep the release gate singular.
20. `COVERAGE`: Before closing the phase, keep adding exactly one failing test at a time until every checkbox in the Contract Coverage Checklist for Contracts 8.1 through 8.4 is checked.

### Files
- `app/lists/_actions/list.ts`
- `lib/invitations/service.ts`
- `package.json`
- `README.md` or `plan/` runbook document

### Phase Gate
- [ ] Every red-green-refactor loop above was completed in order, with one new failing test at a time.
- [ ] Every contract in this phase is verified by at least one explicit test added through the Specification-Driven TDD Workflow.
- [ ] The accumulated unit and integration suites for Contracts 8.1 through 8.4 cover every documented invalidation outcome, non-effect guarantee, and release-gate behavior.
- [ ] `npm run test:unit` passes.
- [ ] `npm run test:integration` passes.
- [ ] `npm run verify:all` passes.

**Jujutsu Checkpoint Subject**: `Phase 8: [describe the lifecycle invalidation and release-hardening work that was actually completed]`

---

## Cross-Phase Test Strategy

### Unit Contracts
- Invitation secret creation and hashing.
- Invitation permission and collaborator-management permission checks.
- Redirect target normalization and continuation-target construction.
- Invitation action-availability mapping.
- Invite invalidation and delivery-failure helper behavior.
- Env verification behavior.

### Integration Contracts
- Owner invariant enforcement.
- Schema migration and backfill normalization.
- Whole invitation issue-and-send workflow.
- Immediate Resend send-response handling, including persisted synchronous failures.
- Whole invitation acceptance workflow.
- Whole collaborator-management data workflow, including the bounded-query requirement for the management view loader.
- Archive and delete invalidation workflows.
- Authenticated webhook signature verification and delivery-failure persistence.

### E2E Contracts
- Logged-out invite continuation through sign-in.
- Invitation management actions for users allowed to manage collaborators.
- Invite acceptance outcomes for valid, invalid, expired, revoked, and `pending_approval` states.

## Migration Notes
- Apply the schema migration before shipping any invitation UI or acceptance route.
- Run the invitation lifecycle backfill immediately after migration.
- Keep both migration and backfill idempotent.
- If production rollout fails, disable invitation entry points with a feature flag or env gate while preserving existing accepted collaborator behavior.

## References
- Roadmap item: `agent-os/product/roadmap.md:26`
- Existing collaborator actions: `app/lists/_actions/collaborators.ts:50`
- Permission model: `app/lists/_actions/permissions.ts:27`
- List page access gate: `app/lists/[listId]/page.tsx:27`
- Sign-in redirect behavior: `app/sign-in/_components/sign-in.tsx:23`
- Schema baseline: `drizzle/schema.ts:54`
- Owner backfill utility: `drizzle/backfillListCollaborators.ts:27`
- Resend send-email API: [resend.com/docs/api-reference/emails/send-email](https://resend.com/docs/api-reference/emails/send-email)
- Resend webhooks: [resend.com/docs/dashboard/webhooks/introduction](https://resend.com/docs/dashboard/webhooks/introduction)
