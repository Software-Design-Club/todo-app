# Task Breakdown: Phase 7 - Lifecycle & Release Hardening

## Overview
Total Tasks: 4 Contracts (9 subtasks)
Feature Size: S (half-day implementation)
Assigned roles: api-engineer

## Task List

### Contract 7.3: invalidateOpenInvitesForList

- [x] 7.3.1 Add RevokedInvitationStatus and ExpiredInvitationStatus types to lib/types.ts
- [x] 7.3.2 Implement invalidateOpenInvitesForList in lib/invitations/service.ts
- [x] 7.3.3 Integration test: one open invite moved to revoked
- [x] 7.3.4 Integration test: invalidates only open invitations, accepted/terminal unchanged
- [x] 7.3.5 Integration test: list_collaborators untouched
- [x] 7.3.6 Integration test: other lists' invitations untouched

### Contract 7.1: archiveList with invalidation

- [x] 7.1.1 Modify archiveList in app/lists/_actions/list.ts to use db.transaction() wrapping invalidation + archive
- [x] 7.1.2 Integration test: archive integration with open invites invalidated
- [x] 7.1.3 Integration test: accepted collaborators survive archive
- [x] 7.1.4 Integration test: unrelated lists untouched

### Contract 7.2: deleteList with invalidation

- [x] 7.2.1 Modify deleteList in app/lists/_actions/list.ts to use db.transaction() wrapping invalidation + delete
- [x] 7.2.2 Integration test: secrets unusable after delete (invitation rows cascade-deleted)

### Contract 7.4: Release gate and runbook

- [x] 7.4.1 Verify npm run verify:all script exists and is configured
- [x] 7.4.2 Create docs/runbook-email-invitations.md with env vars, migration order, backfill order, rollback switch, and troubleshooting
