## Overview

This plan addresses the PR #8 review comments that are still actionable as of **2026-02-12** after checking latest GitHub review threads against current `implement-email-invitation-system` head (`4f690e5f...`).

Actionable items:
1. Preserve `emailDeliveryProviderId` when webhook updates by provider lookup.
2. Keep the provider-id DB index present after migration `0008`.
3. Reconcile Drizzle migration journal entries with migration SQL files.

## Progress Checklist

- [x] Phase 1 complete: provider-ID retention fix + regression coverage
- [x] Phase 2 complete: migration index behavior corrected
- [x] Phase 3 complete: Drizzle journal aligned with migration files
- [ ] Phase 4 complete: full verification run + review-thread closeout notes prepared

## Current State Analysis

- Most unresolved threads are already addressed in code and appear to be stale (imports/functions now exist, syntax issues resolved, `getTodos` now uses view access, `verify:all` includes e2e, test artifacts are untracked).
- `updateInvitationEmailDeliveryStatus` still clears `emailDeliveryProviderId` when called with only `providerId`, which is the webhook code path.
- Migration `0008` still drops `list_collaborators_email_delivery_provider_id_idx`, while `0007` creates it and schema metadata expects it.
- `drizzle/meta/_journal.json` references `0005`/`0006` tags with no matching SQL files and omits `0007`, so migration metadata is inconsistent with repository files.

## Desired End State

1. Webhook-driven delivery updates retain provider correlation keys.
2. Migration chain leaves `list_collaborators_email_delivery_provider_id_idx` present.
3. `drizzle/meta/_journal.json` is aligned with migration files actually in `drizzle/`.
4. Re-run checks and then resolve remaining PR threads with evidence.

Verification:
- Automated: `npm run typecheck`, `npm run lint`, targeted invitation webhook/invitation tests.
- Manual: inspect generated SQL/journal alignment and confirm PR threads can be resolved with specific commit references.

## Key Discoveries

- Provider ID is lost on provider-only update path:
  - `lib/invitations/service.ts:759`
  - `lib/invitations/service.ts:771`
- Webhook uses provider-only update path:
  - `app/api/webhooks/resend/route.ts:72`
- Migration `0007` creates provider index:
  - `drizzle/0007_email_delivery_provider_id_index.sql:1`
- Migration `0008` drops provider index and does not recreate:
  - `drizzle/0008_rename_owner_columns_and_pending_status.sql:2`
- Schema expects provider-id index:
  - `drizzle/schema.ts:125`
- Journal mismatch:
  - `drizzle/meta/_journal.json:44`
  - `drizzle/meta/_journal.json:58`

## Implementation Phases

### Phase 1: Fix Provider-ID Retention Bug

1. Update `updateInvitationEmailDeliveryStatus` so provider-only branch sets local `providerId` before update.
2. Ensure update writes existing provider id when matched by provider lookup.
3. Add/adjust tests for webhook failure events to assert provider id remains set after update.

### Phase 2: Correct Migration Index Behavior

1. Remove or neutralize the provider-index `DROP INDEX` in `0008` (or recreate index in same migration).
2. Confirm final migration state keeps `list_collaborators_email_delivery_provider_id_idx`.
3. If `drizzle/schema.ts` changes as part of this fix, run `npx drizzle-kit push` to apply schema updates to the target database environment.
4. Verify migration SQL sequence does not silently regress webhook lookup performance.

### Phase 3: Reconcile Drizzle Journal Metadata

1. Align `_journal.json` entries with actual migration SQL files in `drizzle/`.
2. Decide consistent strategy for missing `0005`/`0006` files:
   - Preferred: restore the missing SQL migration files if they were intentionally part of history.
   - Fallback: re-sequence journal/files coherently and document why.
3. Validate a clean migration path for fresh environments.

### Phase 4: Validate and Close Review Threads

1. Re-run lint/typecheck and targeted tests for invitations/webhook flow.
2. If schema changed, confirm `npx drizzle-kit push` completed successfully before closing migration-related threads.
3. Post concise per-thread responses with file/line references.
4. Resolve only threads proven fixed; keep any uncertain thread open with follow-up note.

## Success Criteria

- Automated:
  - `npm run lint` passes.
  - `npm run typecheck` passes.
  - Invitation/webhook tests covering provider-id update path pass.
  - `npx drizzle-kit push` succeeds when schema changes are included.
- Manual:
  - `0008` no longer removes provider-id index in final schema state.
  - Journal entries map cleanly to migration SQL files present in repo.
  - All truly actionable PR comments are resolved with linked evidence.

## What We Are Not Doing

- No broad refactor of collaborator read APIs beyond what is required to satisfy still-actionable comments.
- No redesign of invitation lifecycle semantics unrelated to provider-id retention/migration consistency.
- No reopening already-fixed stale comments except to provide closure notes.
