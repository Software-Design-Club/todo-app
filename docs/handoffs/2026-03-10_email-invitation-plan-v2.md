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
  - Schema decision resolved: separate `invitations` table with delivery tracking as columns (not `invitation_delivery_attempts`, not extending `list_collaborators`)
  - Email mismatch tracking added: `acceptedByEmail` and `acceptedByUserId` on `invitations`
  - `pending_approval` lives on `invitations` table — no `list_collaborators` row until owner approves
- In Progress: none
- Blocked: none

## Critical Context

### Resolved Decision: Schema Design
User chose a separate `invitations` table that manages the full invitation lifecycle independently from `list_collaborators`:
- `list_collaborators` holds only accepted members (userId + listId + role, unchanged)
- `invitations` table owns: status lifecycle, secret hash, expiry, delivery tracking, email mismatch tracking
- Delivery tracking columns live directly on `invitations` (no separate `invitation_delivery_attempts` table)
- When accepted: keep the invitation record with `status = 'accepted'`, create a `list_collaborators` row atomically
- When email mismatches: `status = 'pending_approval'`, set `acceptedByEmail` and `acceptedByUserId`, NO `list_collaborators` row until owner approves

This fully unlocks Wave 4 parallelism with column-level isolation:
- Phase 5 writes delivery-tracking columns on `invitations`
- Phase 6 writes `status` (accepted/pending_approval), `acceptedByUserId`, `acceptedByEmail`, `resolvedAt` + creates `list_collaborators` rows
- Phase 7 writes `status` (revoked/expired), `resolvedAt`

### Locked Decisions
- Separate `invitations` table for invitation lifecycle; `list_collaborators` holds only accepted members
- Delivery tracking as columns on `invitations` (no third table)
- Keep invitation records on acceptance (status='accepted') for audit trail
- `pending_approval` on `invitations` table; no `list_collaborators` row until approval
- Track email mismatches via `acceptedByEmail`/`acceptedByUserId` on `invitations`
- Strict email matching on acceptance; mismatch enters `pending_approval`
- GitHub auth only for MVP
- Capability-based authorization (not role-bound)

### Parallel Execution Design
```
Wave 1 (parallel):  Phase 1 (Foundation) + Phase 2 (Test Harness)
Wave 2:             Phase 3 (Schema Evolution — create invitations table)
Wave 3:             Phase 4 (Invitation Issuing)
Wave 4 (parallel):  Phase 5 (Delivery) + Phase 6 (Acceptance) + Phase 7 (Lifecycle)
Wave 5:             Phase 8 (Management UX)
```
Each parallel wave uses `jj workspace add` for isolation. No merge order required within a wave — each workspace passes `verify:all` independently before merging.

### Independence Verification for Wave 4
Verified that Phases 5, 6, 7 are genuinely independent:
- **Column-level isolation**: Phase 5 writes delivery columns (providerMessageId, lastDeliveryError, lastDeliveryAttemptAt, webhookEventType, webhookReceivedAt). Phase 6 writes status (accepted/pending_approval), acceptedByUserId, acceptedByEmail, resolvedAt + list_collaborators. Phase 7 writes status (revoked/expired), resolvedAt. Status writes use mutually exclusive values.
- **File conflicts**: `lib/invitations/service.ts` and `app/lists/_actions/invitations.ts` are created in Phase 4. Wave 4 phases append non-overlapping functions. Merges are mechanical.
- **Test data**: Per-test transaction isolation (Phase 2 responsibility) prevents cross-phase contamination.
- **Schema**: Clean — all phases write to the same `invitations` table but different columns, and status values are mutually exclusive.

## Artifacts
- `thoughts/shared/plans/2026-03-10-email-invitation-system.md` — The plan (updated with separate invitations table)
- `thoughts/shared/plans/2026-02-05-email-invitation-system.md` — Previous plan (still exists, unmodified)

## Next Actions
1. Plan is ready for implementation. Start with Wave 1: Phase 1 + Phase 2 in parallel jj workspaces.
2. Before starting implementation, create the feature bookmark: `jj bookmark create codex/email-invitation-system`.
