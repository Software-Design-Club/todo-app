# Property-Based Testing with fast-check Implementation Plan

## Review Outcome

Ready to implement. All decisions are locked. Three phases: (1) install fast-check and create shared arbitraries, (2) augment specs and write pure-function property tests, (3) augment DB invariant specs and write integration property tests with per-sample savepoint isolation.

---

## Global Contract Rules

- Every property test must reference an explicit `@contract` or `@invariant` spec section by name. No test is written without a linked spec.
- Specification-first: spec augmentations happen as the first step of each phase, before any test file is created.
- **Test structure**: wrap every `it()` inside a `describe` block named after the function under test. Use one `describe` per function per file.
- **`it` naming**: all `it` blocks must start with `"should"`. The name must read as a sentence prefixed with "it": e.g. `it('should never return a URL-absolute path for any input', ...)`.
- **AAA pattern**: every `it` body must follow Arrange / Act / Assert with explicit `// Arrange`, `// Act`, `// Assert` comments.
- **Preferred test API**: use `it.prop` from `@fast-check/vitest` (installed in Phase 1). One `it.prop` per property. Do not batch unrelated properties into a single `it.prop`. Fall back to `fc.assert(fc.property(...))` only if `@fast-check/vitest` is unavailable.
- RED-GREEN-REFACTOR: write each property test to fail first (with no implementation change needed — the function exists; the test fails because the property assertion is wrong or the arbitrary is mis-scoped), then verify it passes.
- Integration property tests must use per-sample savepoint isolation via the `withSavepoint` helper from `tests/support/with-savepoint.ts`. The outer `beforeEach`/`afterEach` transaction from `tests/setup/integration.ts` still wraps the whole `it()` block; savepoints handle intra-test isolation between generated samples.
- Arbitraries live exclusively in `tests/support/arbitraries.ts`. Do not inline `fc.*` calls that construct domain types in test files — import from the shared module.
- Tagged types: arbitraries must produce values cast to the correct tagged type (e.g., `s as InvitationSecret`), not raw primitives.
- No new Vitest projects or `vitest.workspace.ts` changes needed. Property test files use the `.property.test.ts` suffix and are picked up by existing globs:
  - `tests/unit/**/*.test.ts` (unit project)
  - `tests/integration/**/*.test.ts` (integration project)

---

## Required Skills

The following Claude Code skills **must** be invoked at the specified points during implementation. Do not proceed past the trigger point without running the skill.

| Skill | When to invoke | Scope |
|---|---|---|
| `/writing-technical-specifications` | Before writing any `@contract` or `@invariant` augmentation (Phase 2 Step 0, Phase 3 Step 0) | Each JSDoc block being added or augmented — run once per function/invariant |
| `/javascript-testing-expert` | Before writing the first property test in each phase (Phase 2 before P1, Phase 3 before P16) | Covers test structure, fast-check idioms, Vitest integration, and avoiding nondeterministic patterns |

---

## Overview

Adds property-based testing (PBT) to the repo using `fast-check`. Phase 1 installs the dependency and builds shared test infrastructure. Phase 2 writes property tests for five pure domain functions, each backed by augmented JSDoc specs. Phase 3 writes integration property tests for three DB-level invariants (open-invite / collaborator exclusion, invite state machine, list lifecycle post-conditions), each backed by new `@invariant` annotations in the source.

---

## Current State Analysis

### What Exists Today

- Vitest with three projects: `unit` (`tests/unit/**/*.test.ts`), `component` (`tests/component/**/*.test.tsx`), `integration` (`tests/integration/**/*.test.ts`) — `vitest.workspace.ts:6-55`
- Integration setup wraps each `it()` in `BEGIN` / `ROLLBACK` via a single shared `VercelPoolClient` — `tests/setup/integration.ts:8-27`
- `getIntegrationSqlClient()` exposes the active client for raw SQL — `tests/setup/integration.ts:29-37`
- No property-based tests anywhere in the project
- No `fast-check` dependency in `package.json`

**Pure function targets (all in `lib/`):**

| Function | File | Current `@contract` status |
|---|---|---|
| `normalizeRedirectTarget` | `lib/invitations/redirect.ts:12` | ✅ Complete |
| `getAvailableInvitationActions` | `lib/invitations/service.ts:597` | ✅ Complete |
| `hashInvitationSecret` | `lib/invitations/token.ts:28` | ⚠️ Missing: distinctness, output format |
| `buildInvitationAcceptanceUrl` | `lib/invitations/service.ts:197` | ⚠️ Missing: always-absolute invariant, path invariant, token-preservation |
| `normalizeEmailServiceSendResponse` | `lib/invitations/service.ts:319` | ⚠️ Missing: kind round-trip, payload preservation |

**DB invariant targets (no standalone spec exists):**

| Invariant | Status |
|---|---|
| Open-invite / `list_collaborators` mutual exclusion | ❌ Implied across multiple contracts; never stated |
| Invitation state machine (full transition table) | ❌ Individual contracts describe transitions; no consolidated spec |
| Archive/delete list post-conditions | ⚠️ `archiveList` and `deleteList` describe effects; not stated as verifiable invariants |

### Gaps Blocking Implementation

- `fast-check` is not installed
- No shared arbitraries module exists
- No `withSavepoint` helper exists for per-sample DB isolation
- Three pure-function `@contract` docs are missing properties that the tests will verify
- Three DB invariants have no authoritative spec to reference

---

## Desired End State

- `fast-check` installed as a devDependency
- `tests/support/arbitraries.ts` exporting typed fc arbitraries for all relevant domain types
- `tests/support/with-savepoint.ts` exporting a `withSavepoint` helper for integration property tests
- Three `@contract` JSDoc blocks augmented with missing invariant clauses (in source files)
- Three `@invariant` annotations added to `drizzle/schema.ts` and `lib/invitations/service.ts`
- `tests/unit/properties/redirect.property.test.ts` — 5 properties for `normalizeRedirectTarget` + `buildInvitationAcceptanceUrl`
- `tests/unit/properties/token.property.test.ts` — 3 properties for `hashInvitationSecret`
- `tests/unit/properties/service.property.test.ts` — 7 properties for `normalizeEmailServiceSendResponse` + `getAvailableInvitationActions`
- `tests/integration/properties/invitation-exclusion.property.test.ts` — 2 properties for open-invite/collaborator exclusion
- `tests/integration/properties/invitation-state-machine.property.test.ts` — 3 properties for state machine transitions
- `tests/integration/properties/list-lifecycle.property.test.ts` — 3 properties for archive/delete post-conditions
- All 23 property tests pass under `npm run test:unit` and `npm run test:integration`

---

## End-State Verification

- `npm run test:unit` — all unit property tests pass (no fast-check shrinking failures)
- `npm run test:integration` — all integration property tests pass
- `npm run typecheck` — no new type errors
- `npm run lint` — no new lint warnings
- Each property test file contains a comment referencing the governing `@contract` or `@invariant` section

---

## Locked Decisions

- **Arbitraries location**: `tests/support/arbitraries.ts` (shared across unit and integration)
- **Test file location**: `tests/unit/properties/` and `tests/integration/properties/` (no new Vitest project)
- **DB isolation strategy**: per-sample savepoints via `withSavepoint` helper; outer transaction still provides post-test cleanup
- **Execution order**: Phase 2 (pure functions) before Phase 3 (DB) — user preference
- **DB invariant spec home**: `@invariant` JSDoc in `drizzle/schema.ts` for cross-table invariants; consolidated state machine table in `lib/invitations/service.ts`

---

## What We Are Not Doing

- No new Vitest project or `vitest.workspace.ts` changes
- No component-level arbitrary rendering tests in this plan
- No property tests for DB-write functions that require mocking Next.js (`revalidatePath`, `auth`)
- No mutation testing or fuzzing beyond fast-check's shrinking
- No changes to existing example-based tests

---

## Version Control Workflow (Jujutsu)

- Working copy is clean at plan write time (`jj status` confirmed)
- Each phase starts from a clean working copy: run `jj status` before phase work; if dirty, run `jj new` first
- After Phase 1 is complete, run `jj describe -m "feat: fast-check enablement — install + shared arbitraries + savepoint helper"`
- After Phase 2, run `jj describe -m "test: property tests for pure domain functions"`
- After Phase 3, run `jj describe -m "test: integration property tests for DB invariants"`
- No bookmark / branch unless explicitly requested

---

## Parallel Execution Strategy

### Chunk Dependency Map

#### Chunk 1: Phase 1 — Enablement
- Depends on: none
- Unblocks: Chunk 2, Chunk 3
- Parallelizable with: none (prerequisite for all)
- Workspace strategy: single workspace, no isolation needed

#### Chunk 2: Phase 2 — Pure Function Property Tests
- Depends on: Chunk 1 complete
- Unblocks: none
- Parallelizable with: Chunk 3 (logically independent, but execute Phase 2 first per user preference)
- Workspace strategy: single workspace

#### Chunk 3: Phase 3 — DB Integrity Property Tests
- Depends on: Chunk 1 complete
- Unblocks: none
- Parallelizable with: Chunk 2 (but execute after Phase 2 per user preference)
- Workspace strategy: single workspace

---

## Dependency and Third-Party Delta

### New or Changed Dependencies

- `fast-check` ^3.23.0 — property-based testing library for TypeScript. Required by Phases 2 and 3.
- `@fast-check/vitest` ^0.1.0 — Vitest integration for fast-check; provides `it.prop`, `it` with `{g}` destructuring, and `fc` re-export. **Highly recommended** (see javascript-testing-expert skill); install alongside `fast-check` in Phase 1. Falls back to raw `fc.assert` if omitted.

### New External APIs and Hosted Services

- None

### Per-Phase Ownership and Earliest Introduction Point

- Phase 1 owns installing `fast-check` and `@fast-check/vitest`

### Installation/Provisioning and Verification Commands

- Install command: `npm install --save-dev fast-check @fast-check/vitest`
- Verification command: `npm ls fast-check @fast-check/vitest`
- Rollback: `npm uninstall fast-check @fast-check/vitest`

---

## Phase 1: Enablement

### Goal

Install `fast-check`, create the shared arbitraries module at `tests/support/arbitraries.ts`, and create the `withSavepoint` helper at `tests/support/with-savepoint.ts`. No test files are created in this phase — only infrastructure that Phases 2 and 3 depend on.

### Phase Execution Rules

- Governing specifications: this plan (no external spec — this is pure infrastructure)
- Required context: none
- Dependencies / prerequisites: none
- Dependency/service deltas introduced in this phase: `fast-check ^3.23.0` and `@fast-check/vitest ^0.1.0` (both devDependencies)
- Chunk dependencies: none
- Unblocks: Chunks 2 and 3
- Parallelization note: none — this is the root chunk
- Phase start hygiene: run `jj status`; if dirty, run `jj new` before changes
- Relevant existing files:
  - `package.json` — add devDependency
  - `tests/setup/integration.ts:29-37` — `getIntegrationSqlClient()` used by `withSavepoint`
  - `lib/types.ts` — tagged types used in arbitraries
- Constraints: do not create any `*.test.ts` files in this phase

### Specifications

#### Contract 1.1: Shared arbitraries module

`tests/support/arbitraries.ts` exports typed fast-check arbitraries for every domain type needed by Phases 2 and 3. Each arbitrary produces a value cast to the correct tagged type. Exported names follow the convention `fc<TypeName>` (e.g., `fcInvitationSecret`, `fcActorCapabilities`).

Required exports:
- `fcInvitationSecret(): fc.Arbitrary<InvitationSecret>` — non-empty arbitrary string cast to `InvitationSecret`
- `fcEmailAddress(): fc.Arbitrary<EmailAddress>` — `fc.emailAddress()` cast to `EmailAddress`
- `fcNormalizedEmailAddress(): fc.Arbitrary<NormalizedEmailAddress>` — `fc.emailAddress().map(e => e.toLowerCase())` cast to `NormalizedEmailAddress`
- `fcAppBaseUrl(): fc.Arbitrary<AppBaseUrl>` — `fc.oneof(fc.webUrl({ validSchemes: ['http'] }), fc.webUrl({ validSchemes: ['https'] }))` cast to `AppBaseUrl`
- `fcInvitationId(): fc.Arbitrary<InvitationId>` — `fc.integer({ min: 1 })` cast to `InvitationId`
- `fcListId(): fc.Arbitrary<ListId>` — `fc.integer({ min: 1 })` cast to `ListId`
- `fcUserId(): fc.Arbitrary<UserId>` — `fc.integer({ min: 1 })` cast to `UserId`
- `fcProviderMessageId(): fc.Arbitrary<ProviderMessageId>` — `fc.string({ minLength: 1 })` cast
- `fcEmailServiceErrorMessage(): fc.Arbitrary<EmailServiceErrorMessage>` — `fc.string({ minLength: 1 })` cast
- `fcEmailServiceErrorName(): fc.Arbitrary<EmailServiceErrorName>` — `fc.string({ minLength: 1 })` cast
- `fcActorCapabilities(): fc.Arbitrary<ActorCollaboratorCapabilities>` — `fc.record` with five `fc.boolean()` fields
- `fcSentInvitationSummary(): fc.Arbitrary<SentInvitationSummary>` — `fc.record` composing the above
- `fcPendingApprovalInvitationSummary(): fc.Arbitrary<PendingApprovalInvitationSummary>` — `fc.record` composing the above, with `acceptedByEmail` as `fc.oneof(fcNormalizedEmailAddress(), fc.constant(null))`
- `fcInvitationSummary(): fc.Arbitrary<InvitationSummary>` — `fc.oneof(fcSentInvitationSummary(), fcPendingApprovalInvitationSummary())`

#### Contract 1.2: withSavepoint helper

`tests/support/with-savepoint.ts` exports `withSavepoint(fn: () => Promise<void>): Promise<void>`.

Behavior:
- Calls `getIntegrationSqlClient()` to obtain the active test transaction client
- Issues `SAVEPOINT pbt_sp` before calling `fn`
- If `fn` resolves, issues `RELEASE SAVEPOINT pbt_sp`
- If `fn` throws, issues `ROLLBACK TO SAVEPOINT pbt_sp`, then re-throws

Usage pattern in integration property tests (preferred — `@fast-check/vitest`):
```ts
import { describe } from 'vitest';
import { it, fc } from '@fast-check/vitest';
import { withSavepoint } from '../support/with-savepoint';

describe('someInvariant', () => {
  it.prop([someArbitrary], { numRuns: 20 })('should hold the invariant for any input', async (value) => {
    // Arrange / Act / Assert inside savepoint
    await withSavepoint(async () => {
      // set up, mutate, assert invariant
    });
  });
});
```

Fallback pattern (raw `fast-check`, if `@fast-check/vitest` is unavailable):
```ts
await fc.assert(
  fc.asyncProperty(someArbitrary, async (value) => {
    await withSavepoint(async () => {
      // set up, mutate, assert invariant
    });
  }),
  { numRuns: 20 }
);
```

Note on `g` function: when using the `{ g }` destructuring from `@fast-check/vitest`, pass the arbitrary **function** (not its result): `g(fc.string)` not `g(fc.string())`.

Because `ROLLBACK TO SAVEPOINT` keeps the savepoint alive in Postgres, the same savepoint name `pbt_sp` can be reused across samples within a single `it.prop` block. The outer `afterEach` `ROLLBACK` from `tests/setup/integration.ts` cleans up all savepoint state at test completion.

Since `getIntegrationSqlClient()` returns a `VercelPoolClient` extending `pg.PoolClient`, use `client.query('SAVEPOINT pbt_sp')` (raw string query, not template literal) to avoid parameter-binding issues with DDL-like statements.

### Contract Coverage Checklist

#### Contract 1.1 checklist
- [ ] All listed exports exist and are importable
- [ ] Each arbitrary produces values of the correct TypeScript type (checked by `tsc --noEmit`)
- [ ] `fcSentInvitationSummary` always produces `kind: "sent"`
- [ ] `fcPendingApprovalInvitationSummary` always produces `kind: "pending_approval"`

#### Contract 1.2 checklist
- [ ] `withSavepoint` calls `SAVEPOINT` before `fn` and `RELEASE` after success
- [ ] `withSavepoint` calls `ROLLBACK TO SAVEPOINT` on throw and re-throws the error
- [ ] Importing `withSavepoint` outside an active integration test throws `"Integration database client is unavailable outside the active test transaction."`

### Specification-Driven TDD Workflow

- No property tests in this phase — validate infrastructure through TypeScript typechecking and a smoke integration test in `tests/integration/smoke.test.ts` (already exists and runs in CI)
- First failing check: `npm run typecheck` fails if arbitraries import wrong types → write types correctly → typecheck passes
- Commands: `npm run typecheck`, `npm run lint`

### Phase Test Strategy

- No new test files in this phase
- Type correctness validated by `npm run typecheck`
- `withSavepoint` helper validated indirectly in Phase 3 — not independently tested to avoid circular dependency

### Phase Test Checklist (Mark Green During Implementation)

- [ ] `T1` `npm run typecheck` — no type errors after adding arbitraries and helper, command: `npm run typecheck`
- [ ] `T2` `npm run lint` — no lint warnings, command: `npm run lint`

### Files

- `package.json` — add `"fast-check": "^3.23.0"` and `"@fast-check/vitest": "^0.1.0"` to `devDependencies`
- `tests/support/arbitraries.ts` — create: all shared fc arbitraries
- `tests/support/with-savepoint.ts` — create: savepoint helper for integration property tests

### Phase Gate

#### Automated Verification
- [ ] Phase started from a clean working copy (`jj status` clean before first code change)
- [ ] `fast-check` and `@fast-check/vitest` appear in `package.json` devDependencies and in `node_modules`
- [ ] `tests/support/arbitraries.ts` exports all types listed in Contract 1.1
- [ ] `tests/support/with-savepoint.ts` exports `withSavepoint`
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes

#### Manual Verification
- [ ] Import `fcInvitationSecret` in a scratch REPL / ts-node and verify it produces strings

---

## Phase 2: Pure Function Property Tests

### Goal

Augment the three incomplete `@contract` JSDoc blocks (`hashInvitationSecret`, `buildInvitationAcceptanceUrl`, `normalizeEmailServiceSendResponse`) with the invariant clauses the property tests will verify. Then write 15 property tests across three files covering all five pure-function targets.

### Phase Execution Rules

- Governing specifications: augmented `@contract` JSDoc in source files (written in this phase before tests)
- Required context: Phase 1 complete (`fast-check` installed, `tests/support/arbitraries.ts` available)
- Dependencies / prerequisites: Phase 1 gate passed
- Dependency/service deltas introduced in this phase: none
- Chunk dependencies: Chunk 1 complete
- Unblocks: none (parallelizable with Chunk 3 but executed first per user preference)
- Phase start hygiene: `jj status` clean; run `jj new` if dirty
- Relevant existing files:
  - `lib/invitations/token.ts:28` — `hashInvitationSecret` `@contract`
  - `lib/invitations/service.ts:197` — `buildInvitationAcceptanceUrl` `@contract`
  - `lib/invitations/service.ts:319` — `normalizeEmailServiceSendResponse` `@contract`
  - `lib/invitations/redirect.ts:12` — `normalizeRedirectTarget` `@contract` (complete, no changes needed)
  - `lib/invitations/service.ts:597` — `getAvailableInvitationActions` `@contract` (complete, no changes needed)
  - `tests/unit/invitations/redirect.test.ts` — existing example tests (do not modify)
  - `tests/unit/invitations/token.test.ts` — existing example tests (do not modify)
  - `tests/unit/invitations/action-availability.test.ts` — existing example tests (do not modify)
- Constraints: do not modify existing test files; property tests are additive
- Execution order: spec augmentation first, then one property test at a time (RED-GREEN-REFACTOR per property)

### Specifications

#### Contract 2.1: hashInvitationSecret augmented invariants

Add to the existing `@contract hashInvitationSecret` in `lib/invitations/token.ts`:

```
 * @invariant Distinct: for any two InvitationSecret values s1 and s2 where
 *   s1 !== s2, hashInvitationSecret(s1) !== hashInvitationSecret(s2) with
 *   overwhelming probability (SHA-256 collision resistance).
 * @invariant OutputFormat: the returned value is always a non-empty string of
 *   exactly 64 lowercase hexadecimal characters.
```

#### Contract 2.2: buildInvitationAcceptanceUrl augmented invariants

Add to the existing `@contract buildInvitationAcceptanceUrl` in `lib/invitations/service.ts`:

```
 * @invariant AlwaysAbsolute: the returned URL always starts with "http://"
 *   or "https://". It is never a relative or protocol-relative URL.
 * @invariant PathIsInvite: the path component of the returned URL is always
 *   "/invite", regardless of the appBaseUrl path.
 * @invariant TokenPreservation: new URL(result).searchParams.get("token")
 *   strictly equals the provided secret string.
```

#### Contract 2.3: normalizeEmailServiceSendResponse augmented invariants

Add to the existing `@contract normalizeEmailServiceSendResponse` in `lib/invitations/service.ts`:

```
 * @invariant KindRoundTrip: response.kind === "accepted" if and only if
 *   result.kind === "accepted_for_delivery". response.kind === "rejected"
 *   if and only if result.kind === "send_failed".
 * @invariant ProviderMessageIdPreservation: when response.kind === "accepted",
 *   result.providerMessageId strictly equals response.providerMessageId.
 * @invariant ErrorPayloadPreservation: when response.kind === "rejected",
 *   result.providerErrorMessage strictly equals response.errorMessage, and
 *   result.providerErrorName strictly equals response.errorName (including undefined).
```

#### Contract 2.4: normalizeRedirectTarget property invariants (existing spec, referenced only)

From existing `@contract normalizeRedirectTarget` in `lib/invitations/redirect.ts:12`:

- **SafetyInvariant**: for any string input, the output never contains `"://"`, never starts with `"//"`, never contains `"\\"`, and always starts with `"/"`
- **ValidInputIdentity**: for any trimmed string `s` that starts with `"/"`, does not start with `"//"`, does not contain `"://"`, and does not contain `"\\"`, `normalizeRedirectTarget(s) === s`
- **InvalidInputDefault**: all other inputs return exactly `"/"`

#### Contract 2.5: getAvailableInvitationActions property invariants (existing spec, referenced only)

From existing `@contract getAvailableInvitationActions` in `lib/invitations/service.ts:597`:

- **SubsetInvariant**: for any invitation and capabilities, every returned action kind is one the actor has capability for
- **IdPreservation**: every returned action has `invitationId` equal to `invitation.invitationId`
- **KindExclusivity**: sent invitation → returned actions never include `"approve"` or `"reject"`; pending_approval → returned actions never include `"resend"`, `"revoke"`, or `"copy_link"`
- **CapabilityGate**: `canResend = false` → no `"resend"` action; `canRevoke = false` → no `"revoke"` action; `canCopyLink = false` → no `"copy_link"` action; `canApprove = false` → no `"approve"` action; `canReject = false` → no `"reject"` action

### Contract Coverage Checklist

#### Contract 2.1 checklist
- [ ] Property: `hash(s) === hash(s)` for any `s` (determinism, already implied but now tested over arbitrary inputs)
- [ ] Property: `s1 !== s2 → hash(s1) !== hash(s2)` (distinctness)
- [ ] Property: output is exactly 64 characters and matches `/^[0-9a-f]{64}$/` (output format)

#### Contract 2.2 checklist
- [ ] Property: output starts with `"http://"` or `"https://"` (always-absolute)
- [ ] Property: `new URL(output).pathname === "/invite"` (path invariant)
- [ ] Property: `new URL(output).searchParams.get("token") === secret` (token preservation)

#### Contract 2.3 checklist
- [ ] Property: `response.kind === "accepted"` → `result.kind === "accepted_for_delivery"` and vice versa
- [ ] Property: `response.kind === "rejected"` → `result.kind === "send_failed"` and vice versa
- [ ] Property: `providerMessageId` preserved for accepted responses
- [ ] Property: `errorMessage` preserved as `providerErrorMessage` for rejected responses
- [ ] Property: optional `errorName` preserved as `providerErrorName` (including undefined)

#### Contract 2.4 checklist
- [ ] Property: output never contains `"://"`, never starts with `"//"`, never contains `"\\"`, always starts with `"/"` (SafetyInvariant)
- [ ] Property: valid inputs are returned unchanged (ValidInputIdentity)

#### Contract 2.5 checklist
- [ ] Property: all returned action kinds are capability-gated (SubsetInvariant)
- [ ] Property: all returned action `invitationId` values equal input `invitationId` (IdPreservation)
- [ ] Property: sent invitation never produces approve/reject (KindExclusivity — sent branch)
- [ ] Property: pending_approval never produces resend/revoke/copy_link (KindExclusivity — pending_approval branch)
- [ ] Property: each individual capability flag gates its action (CapabilityGate)

### Specification-Driven TDD Workflow

- **Skill trigger — spec authoring**: Before writing any `@contract` augmentation, invoke `/writing-technical-specifications` for each JSDoc block being added or extended (Contracts 2.1, 2.2, 2.3).
- **Skill trigger — test authoring**: Before writing P1, invoke `/javascript-testing-expert` to confirm test structure, fast-check property patterns, and Vitest integration for this phase.
- Step 0 (before any test): augment the three `@contract` JSDoc blocks. Run `npm run typecheck` — must pass.
- First test to write: P1 — `normalizeRedirectTarget` SafetyInvariant (most important: security-critical)
- Remaining contract-test inventory (in order):
  1. P2 — `normalizeRedirectTarget` ValidInputIdentity
  2. P3 — `buildInvitationAcceptanceUrl` AlwaysAbsolute
  3. P4 — `buildInvitationAcceptanceUrl` PathIsInvite
  4. P5 — `buildInvitationAcceptanceUrl` TokenPreservation
  5. P6 — `hashInvitationSecret` determinism over arbitrary inputs
  6. P7 — `hashInvitationSecret` distinctness
  7. P8 — `hashInvitationSecret` output format
  8. P9 — `normalizeEmailServiceSendResponse` KindRoundTrip (accepted branch)
  9. P10 — `normalizeEmailServiceSendResponse` KindRoundTrip (rejected branch)
  10. P11 — `normalizeEmailServiceSendResponse` ProviderMessageIdPreservation
  11. P12 — `normalizeEmailServiceSendResponse` ErrorPayloadPreservation
  12. P13 — `getAvailableInvitationActions` SubsetInvariant
  13. P14 — `getAvailableInvitationActions` IdPreservation
  14. P15 — `getAvailableInvitationActions` KindExclusivity
- Execution rule: each property test must fail for the right reason (e.g., wrong assertion) before the property assertion is corrected and it goes GREEN
- Delete-and-rebuild note: not applicable — no existing implementation is being replaced
- Commands:
  - `npm run test:unit -- --reporter=verbose` (all unit tests including properties)
  - Targeted: `npx vitest run --project unit tests/unit/properties/redirect.property.test.ts`

### Phase Test Strategy

- Contract-to-test mapping: one `it.prop` per property (15 properties total across 3 files); each wrapped in a `describe` named after its target function
- Import pattern: `import { describe } from 'vitest'; import { it, fc } from '@fast-check/vitest';`
- Test levels: unit only (no DB, no network)
- Execution order: redirect → token → service (risk-first: `normalizeRedirectTarget` is security-critical)
- Evidence capture: `npm run test:unit` output shows all 15 properties passing

### Phase Test Checklist (Mark Green During Implementation)

**`tests/unit/properties/redirect.property.test.ts`**
- [ ] `P1` `normalizeRedirectTarget` SafetyInvariant — covers Contract 2.4, command: `npx vitest run --project unit tests/unit/properties/redirect.property.test.ts`
- [ ] `P2` `normalizeRedirectTarget` ValidInputIdentity — covers Contract 2.4
- [ ] `P3` `buildInvitationAcceptanceUrl` AlwaysAbsolute — covers Contract 2.2
- [ ] `P4` `buildInvitationAcceptanceUrl` PathIsInvite — covers Contract 2.2
- [ ] `P5` `buildInvitationAcceptanceUrl` TokenPreservation — covers Contract 2.2

**`tests/unit/properties/token.property.test.ts`**
- [ ] `P6` `hashInvitationSecret` determinism — covers Contract 2.1, command: `npx vitest run --project unit tests/unit/properties/token.property.test.ts`
- [ ] `P7` `hashInvitationSecret` distinctness — covers Contract 2.1
- [ ] `P8` `hashInvitationSecret` output format — covers Contract 2.1

**`tests/unit/properties/service.property.test.ts`**
- [ ] `P9` `normalizeEmailServiceSendResponse` KindRoundTrip (accepted) — covers Contract 2.3, command: `npx vitest run --project unit tests/unit/properties/service.property.test.ts`
- [ ] `P10` `normalizeEmailServiceSendResponse` KindRoundTrip (rejected) — covers Contract 2.3
- [ ] `P11` `normalizeEmailServiceSendResponse` ProviderMessageIdPreservation — covers Contract 2.3
- [ ] `P12` `normalizeEmailServiceSendResponse` ErrorPayloadPreservation — covers Contract 2.3
- [ ] `P13` `getAvailableInvitationActions` SubsetInvariant — covers Contract 2.5
- [ ] `P14` `getAvailableInvitationActions` IdPreservation — covers Contract 2.5
- [ ] `P15` `getAvailableInvitationActions` KindExclusivity — covers Contract 2.5

### Files

- `lib/invitations/token.ts` — augment `@contract hashInvitationSecret` with `@invariant Distinct` and `@invariant OutputFormat`
- `lib/invitations/service.ts` — augment `@contract buildInvitationAcceptanceUrl` with three `@invariant` clauses; augment `@contract normalizeEmailServiceSendResponse` with three `@invariant` clauses
- `tests/unit/properties/redirect.property.test.ts` — create: P1–P5
- `tests/unit/properties/token.property.test.ts` — create: P6–P8
- `tests/unit/properties/service.property.test.ts` — create: P9–P15

### Phase Gate

#### Automated Verification
- [ ] Phase started from a clean working copy
- [ ] Three `@contract` blocks augmented in source files before any test file is created
- [ ] `npm run typecheck` passes after spec augmentation
- [ ] All 15 property tests in Phase Test Checklist are marked GREEN
- [ ] `npm run test:unit` passes (all unit tests, including existing example tests)
- [ ] `npm run lint` passes
- [ ] Each test file has a comment citing the governing `@contract` section

#### Manual Verification
- [ ] Introduce a deliberate bug in `normalizeRedirectTarget` (e.g., remove the `//` check) and confirm P1 or P2 fails with a counterexample
- [ ] Restore the bug fix, confirm all tests pass again

---

## Phase 3: DB Integrity Property Tests

### Goal

Document three DB-level invariants as `@invariant` annotations in source files, then write eight integration property tests that verify those invariants over arbitrary operation sequences. Each test uses `withSavepoint` for per-sample isolation within the outer integration transaction.

### Phase Execution Rules

- Governing specifications: `@invariant` annotations added in this phase (to `drizzle/schema.ts` and `lib/invitations/service.ts`) before any test file is created
- Required context: Phase 1 complete (fast-check installed, `withSavepoint` helper available); Phase 2 recommended but not a hard dependency
- Dependencies / prerequisites: Chunk 1 (Phase 1) complete
- Dependency/service deltas introduced in this phase: none
- Chunk dependencies: Chunk 1 complete
- Unblocks: none
- Parallelization note: can run concurrently with Phase 2 using `using-jj-workspaces`, but preferred execution order is after Phase 2
- Phase start hygiene: `jj status` clean; run `jj new` if dirty
- Relevant existing files:
  - `drizzle/schema.ts` — add `@invariant` blocks
  - `lib/invitations/service.ts` — add consolidated state machine `@invariant`
  - `app/lists/_actions/list.ts` — `archiveList` and `deleteList` implementations
  - `app/lists/_actions/invitations.ts` — `approveInvitation`, `rejectInvitation`, `revokeInvitation`
  - `tests/setup/integration.ts` — `getIntegrationSqlClient()` used by `withSavepoint`
  - `tests/support/with-savepoint.ts` — created in Phase 1
  - `tests/support/arbitraries.ts` — created in Phase 1
- Constraints:
  - Property tests must not call Next.js server-action wrappers that invoke `auth()` or `revalidatePath()`. Call the underlying lib functions directly (e.g., `issueInvitation`, `resolveInviteAcceptance` from `lib/invitations/service.ts`; `archiveList`/`deleteList` are in `app/lists/_actions/list.ts` and call `revalidatePath` — see Agent Handoff Note below).
  - Integration property tests reuse the same real test DB used by other integration tests. Keep sample counts low (default 10–20) to avoid excessive DB round-trips.
- Agent handoff note: `archiveList` and `deleteList` call `revalidatePath()` which throws outside of a Next.js request context. In integration tests, mock `revalidatePath` using `vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))` at the top of the list-lifecycle test file, or extract the core DB logic into a lib function and call that directly. Verify which approach other integration tests use (e.g., `tests/integration/invitations/lifecycle.test.ts`).

### Specifications

#### Contract 3.1: Open-invite / list_collaborators mutual exclusion invariant

Add to `drizzle/schema.ts` (header comment block or inline above `InvitationsTable`):

```
 * @invariant OpenInviteMutualExclusion
 *
 * For any (listId, userId) pair, the following must hold at all times after
 * any write transaction completes:
 *
 * If a row exists in list_collaborators for (listId, userId), then no row
 * exists in invitations for the same listId where:
 *   - invitedEmailNormalized = user.email (normalized), AND
 *   - status IN ('pending', 'sent')
 *
 * Equivalently: open invitations (pending, sent) are always closed before
 * a list_collaborators row is inserted for the same (listId, user) pair.
 *
 * Note: pending_approval coexists with NO list_collaborators row by design.
 * The user has attempted acceptance but the owner has not yet approved.
 *
 * Enforced by: resolveInviteAcceptance (atomic transition), approveInvitation
 * (atomic transition). Not enforced by DB constraint — this is an application
 * invariant verified by property tests.
```

#### Contract 3.2: Invitation state machine invariant

Add to `lib/invitations/service.ts` (header of the module or above `resolveInviteAcceptance`):

```
 * @invariant InvitationStateMachine
 *
 * Valid transitions (source → target, via function):
 *   pending          → sent              issueInvitation (rotation/resend)
 *   pending          → revoked           archiveList, deleteList
 *   sent             → accepted          resolveInviteAcceptance (email matches)
 *   sent             → pending_approval  resolveInviteAcceptance (email mismatch)
 *   sent             → revoked           revokeInvitation, archiveList, deleteList
 *   sent             → expired           resolveInviteAcceptance (expiresAt < now)
 *   pending_approval → accepted          approveInvitation
 *   pending_approval → revoked           rejectInvitation
 *
 * Terminal states (no valid outbound transition):
 *   accepted, revoked, expired
 *
 * Invariants:
 *   - A terminal-state invitation is never updated to a non-terminal status.
 *   - An open invitation (pending, sent) is consumed atomically with the
 *     collaborator row insertion it enables (resolveInviteAcceptance, approveInvitation).
 *   - At most one open invitation (pending, sent) exists per (listId, invitedEmailNormalized)
 *     pair at any time (enforced by issueInvitation upsert logic).
```

#### Contract 3.3: List lifecycle post-condition invariants

Add to `app/lists/_actions/list.ts` (augment existing `@contract archiveList` and `@contract deleteList`):

For `archiveList`:
```
 * @invariant ArchivePostCondition
 *   After archiveList completes:
 *   - lists.state = 'archived' for listId
 *   - COUNT(invitations WHERE listId = ? AND status IN ('pending','sent')) = 0
 *   - list_collaborators rows for listId are not modified
```

For `deleteList`:
```
 * @invariant DeletePostCondition
 *   After deleteList completes:
 *   - No lists row exists for listId
 *   - No invitations rows exist for listId (cascade)
 *   - No list_collaborators rows exist for listId (cascade)
```

### Contract Coverage Checklist

#### Contract 3.1 checklist
- [ ] Property: after `resolveInviteAcceptance` with email match, no open invite exists for (listId, userId email) AND the `list_collaborators` row exists
- [ ] Property: after `approveInvitation`, no open invite exists for the acceptance user AND the `list_collaborators` row exists

#### Contract 3.2 checklist
- [ ] Property: a terminal-state invitation cannot transition to any other status via any application function
- [ ] Property: `issueInvitation` never creates a second open invitation row for the same (listId, invitedEmailNormalized) — at most one open invite per pair
- [ ] Property: arbitrary sequences of valid transitions do not leave an invitation in an invalid intermediate state

#### Contract 3.3 checklist
- [ ] Property: after `archiveList`, `COUNT(invitations WHERE listId AND status IN ('pending','sent')) = 0`
- [ ] Property: after `deleteList`, no rows exist for listId in lists, invitations, or list_collaborators
- [ ] Property: `archiveList` does not remove `list_collaborators` rows (collaborators are preserved)

### Specification-Driven TDD Workflow

- **Skill trigger — spec authoring**: Before writing any `@invariant` annotation, invoke `/writing-technical-specifications` for each block being added (Contracts 3.1, 3.2, 3.3).
- **Skill trigger — test authoring**: Before writing P16, invoke `/javascript-testing-expert` to confirm async property patterns, `fc.commands` model, `withSavepoint` integration, and `numRuns` tuning for integration tests.
- Step 0: add the three `@invariant` annotations to source files; run `npm run typecheck` — must pass
- First test to write: P16 — open-invite / collaborator exclusion after `resolveInviteAcceptance` (most critical: verifies the core acceptance atomicity)
- Remaining contract-test inventory:
  1. P17 — open-invite / collaborator exclusion after `approveInvitation`
  2. P18 — terminal states cannot transition (state machine)
  3. P19 — at most one open invite per (listId, email) pair (single-open-invite invariant)
  4. P20 — valid transition sequences leave invitation in a valid state (`fc.commands`)
  5. P21 — after `archiveList`, no open invitations remain
  6. P22 — after `deleteList`, no rows remain for the list
  7. P23 — `archiveList` preserves `list_collaborators` rows
- Execution rule: complete each property through RED, GREEN, REFACTOR before adding the next
- Commands:
  - `npx vitest run --project integration tests/integration/properties/invitation-exclusion.property.test.ts`
  - `npx vitest run --project integration tests/integration/properties/invitation-state-machine.property.test.ts`
  - `npx vitest run --project integration tests/integration/properties/list-lifecycle.property.test.ts`
  - `npm run test:integration` (all integration tests)

### Phase Test Strategy

- Contract-to-test mapping: one `it.prop` per property (8 properties across 3 files); each wrapped in a `describe` named after the invariant under test
- Import pattern: `import { describe } from 'vitest'; import { it, fc } from '@fast-check/vitest';`
- Sample count: pass `{ numRuns: 20 }` as the second argument to `it.prop` to keep DB round-trips manageable; use `{ numRuns: 50 }` for the state machine test (P20)
- Test levels: integration (real DB, real transactions)
- Execution order: exclusion first (most critical), then state machine, then list lifecycle
- Isolation: each `it.prop` block is wrapped in the outer integration transaction; each sample invocation uses `withSavepoint` for intra-test isolation
- Evidence capture: `npm run test:integration` output

### Phase Test Checklist (Mark Green During Implementation)

**`tests/integration/properties/invitation-exclusion.property.test.ts`**
- [ ] `P16` open-invite exclusion after email-match acceptance — covers Contract 3.1, command: `npx vitest run --project integration tests/integration/properties/invitation-exclusion.property.test.ts`
- [ ] `P17` open-invite exclusion after owner approval — covers Contract 3.1

**`tests/integration/properties/invitation-state-machine.property.test.ts`**
- [ ] `P18` terminal states cannot be transitioned — covers Contract 3.2, command: `npx vitest run --project integration tests/integration/properties/invitation-state-machine.property.test.ts`
- [ ] `P19` at most one open invite per (listId, email) — covers Contract 3.2
- [ ] `P20` valid transition sequences leave invitation in valid state (`fc.commands`) — covers Contract 3.2

**`tests/integration/properties/list-lifecycle.property.test.ts`**
- [ ] `P21` archiveList leaves no open invitations — covers Contract 3.3, command: `npx vitest run --project integration tests/integration/properties/list-lifecycle.property.test.ts`
- [ ] `P22` deleteList removes all rows for the list — covers Contract 3.3
- [ ] `P23` archiveList preserves list_collaborators rows — covers Contract 3.3

### Files

- `drizzle/schema.ts` — add `@invariant OpenInviteMutualExclusion` comment block
- `lib/invitations/service.ts` — add `@invariant InvitationStateMachine` comment block
- `app/lists/_actions/list.ts` — augment `@contract archiveList` and `@contract deleteList` with `@invariant` post-conditions
- `tests/integration/properties/invitation-exclusion.property.test.ts` — create: P16–P17
- `tests/integration/properties/invitation-state-machine.property.test.ts` — create: P18–P20
- `tests/integration/properties/list-lifecycle.property.test.ts` — create: P21–P23

### Phase Gate

#### Automated Verification
- [ ] Phase started from a clean working copy
- [ ] Three `@invariant` annotations added to source files before any test file is created
- [ ] `npm run typecheck` passes after invariant annotations
- [ ] All 8 property tests in Phase Test Checklist are marked GREEN
- [ ] `npm run test:integration` passes (all integration tests)
- [ ] `npm run lint` passes
- [ ] Each test file has a comment citing the governing `@invariant` section

#### Manual Verification
- [ ] Temporarily comment out the `inArray(InvitationsTable.status, [...OPEN_INVITATION_STATUSES])` guard in `resolveInviteAcceptance` and confirm P16 finds a counterexample
- [ ] Restore the guard; confirm P16 passes again
- [ ] Verify that shrinking works: fast-check outputs a minimal counterexample when a property fails, not a full complex sequence

---

## Cross-Phase Test Notes

### Unit Contracts
- Pure function property tests (P1–P15) supplement existing example tests in `tests/unit/invitations/`. Both suites must pass together.

### Integration Contracts
- DB property tests (P16–P23) supplement existing integration tests in `tests/integration/invitations/`. Both suites must pass together.

### E2E Contracts
- No property tests at the E2E (Playwright) level in this plan.

---

## Migration Notes

- None. This plan adds test infrastructure and tests only; no schema changes, no data migrations.

---

## Security Review

**Status:** Clean
**Reviewed:** 2026-03-14

### Findings

This plan adds test-only files and JSDoc augmentation. No new API endpoints, no new authentication flows, no user-facing behavior changes. No new secrets or environment variables introduced. `fast-check` is a devDependency and is not bundled into production.

`withSavepoint` uses `client.query('SAVEPOINT pbt_sp')` with a hardcoded savepoint name (no user input). No SQL injection surface.

### Checklist Coverage

| Category | Applicable? | Finding |
|---|---|---|
| Injection (SQL, XSS, command) | Not applicable | Test-only code; no user input paths |
| Authentication / authorization | Not applicable | No new auth surfaces |
| Secrets / env vars | Not applicable | No new secrets |
| Supply chain | Low risk | `fast-check` is a well-maintained OSS library (>10M weekly downloads); pin to a minor range |
| Data exposure | Not applicable | Test DB only; no prod data |

---

## References

- `lib/invitations/redirect.ts:12` — `@contract normalizeRedirectTarget`
- `lib/invitations/token.ts:28` — `@contract hashInvitationSecret`
- `lib/invitations/service.ts:197` — `@contract buildInvitationAcceptanceUrl`
- `lib/invitations/service.ts:319` — `@contract normalizeEmailServiceSendResponse`
- `lib/invitations/service.ts:597` — `@contract getAvailableInvitationActions`
- `app/lists/_actions/list.ts:380` — `@contract archiveList`
- `app/lists/_actions/list.ts:472` — `@contract deleteList`
- `tests/setup/integration.ts` — transaction isolation setup (BEGIN / ROLLBACK per `it()`)
- `vitest.workspace.ts` — Vitest project configuration
- fast-check documentation: https://fast-check.dev
