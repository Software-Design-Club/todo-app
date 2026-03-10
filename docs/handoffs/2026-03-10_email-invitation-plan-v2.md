---
date: 2026-03-10
author: amp
jj_commit: befa87681e6e
bookmark: (none)
repository: todo-app
topic: "email-invitation-plan-v2"
type: handoff
status: in-progress
last_updated: 2026-03-10
---

# Handoff: Email Invitation System Plan v2

## Task Status
- Completed:
  - Full 8-phase plan written at `thoughts/shared/plans/2026-03-10-email-invitation-system.md`
  - Parallel execution strategy designed with 5 waves and chunk dependency map
  - Security review completed inline
  - Contract JSDoc convention established (contracts above functions, file-level module JSDoc for multi-function files)
- In Progress:
  - User has an open decision about `invitation_delivery_attempts` as a separate table vs columns on `list_collaborators`
- Blocked:
  - Implementation cannot start until the `invitation_delivery_attempts` table decision is resolved

## Critical Context

### Open Decision: Delivery Tracking Schema
The plan introduces `invitation_delivery_attempts` as a separate table. The motivation is purely parallel execution safety in Wave 4:
- Phase 5 (Delivery) writes to `invitation_delivery_attempts` only
- Phase 6 (Acceptance) writes to `list_collaborators.inviteStatus` (accepted/pending_approval)
- Phase 7 (Lifecycle) writes to `list_collaborators.inviteStatus` (revoked/expired)
- Zero schema overlap means all three phases can run in parallel jj workspaces

The alternative is adding `providerMessageId`, `lastDeliveryError`, etc. as columns on `list_collaborators`. This is simpler (one table) but forces Phase 5 to modify the same `drizzle/schema.ts` table definition that Phases 6 and 7 depend on, breaking Wave 4 parallelism. If the user chooses this, Phases 5/6/7 must run sequentially instead.

### Locked Decisions (carried from previous plan)
- Extend `list_collaborators` for invitation lifecycle (not a separate invitations table)
- Strict email matching on acceptance; mismatch enters `pending_approval`
- GitHub auth only for MVP
- Capability-based authorization (not role-bound)

### Phase Renumbering
Original plan phases were renumbered to match execution order:
- Old Phase 8 (Lifecycle) is now Phase 7 (runs in Wave 4 parallel with old Phases 5 and 6)
- Old Phase 7 (Management UX) is now Phase 8 (convergence point, Wave 5)

### Parallel Execution Design
```
Wave 1 (parallel):  Phase 1 (Foundation) + Phase 2 (Test Harness)
Wave 2:             Phase 3 (Schema Evolution)
Wave 3:             Phase 4 (Invitation Issuing)
Wave 4 (parallel):  Phase 5 (Delivery) + Phase 6 (Acceptance) + Phase 7 (Lifecycle)
Wave 5:             Phase 8 (Management UX)
```
Each parallel wave uses `jj workspace add` for isolation. No merge order required within a wave — each workspace passes `verify:all` independently before merging.

### Independence Verification for Wave 4
Verified that Phases 5, 6, 7 are genuinely independent:
- **State machine**: No write-write collision. Phase 5 doesn't touch `inviteStatus`. Phase 6 writes accepted/pending_approval. Phase 7 writes revoked/expired. Mutually exclusive target values.
- **File conflicts**: `lib/invitations/service.ts` and `app/lists/_actions/invitations.ts` are created in Phase 4. Wave 4 phases append non-overlapping functions. Merges are mechanical.
- **Test data**: Per-test transaction isolation (Phase 2 responsibility) prevents cross-phase contamination.
- **Schema**: Clean only if delivery tracking is in a separate table (the open decision above).

## Artifacts
- `thoughts/shared/plans/2026-03-10-email-invitation-system.md` — The new plan (replaces `2026-02-05` version)
- `thoughts/shared/plans/2026-02-05-email-invitation-system.md` — Previous plan (still exists, unmodified in this change)

## Next Actions
1. Resolve the `invitation_delivery_attempts` table decision with the user.
2. If the user rejects the separate table, update the plan to make Wave 4 sequential (Phases 5 -> 6 -> 7 or similar ordering).
3. If the user accepts, the plan is ready for implementation. Start with Wave 1: Phase 1 + Phase 2 in parallel jj workspaces.
4. Before starting implementation, create the feature bookmark: `jj bookmark create codex/email-invitation-system`.
