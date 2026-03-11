# Task Breakdown: Phase 8 - Collaborator Management Workflow & UX

## Overview
Total Tasks: 6 Contracts (multiple subtasks)
Feature Size: M (full-day implementation)
Assigned roles: api-engineer

## Task List

### Step 0: Fix delivery result wiring

- [x] 0.1 Verify handleInvitationSendResponseWorkflow is called from inviteCollaboratorWorkflow (already wired in service.ts)

### Contract 8.4: getAvailableInvitationActions (pure function)

- [x] 8.4.1 Add Phase 8 types to lib/types.ts (SentInvitationSummary, PendingApprovalInvitationSummary, InvitationSummary, ActorCollaboratorCapabilities, InvitationAction, SentInvitationAction, PendingApprovalInvitationAction, AcceptedCollaborator, CollaboratorManagementListView, CollaboratorManagementViewData)
- [x] 8.4.2 Implement getAvailableInvitationActions in lib/invitations/service.ts
- [x] 8.4.3 Unit test: sent invitation with full capabilities returns [resend, revoke, copy_link]
- [x] 8.4.4 Unit test: pending_approval invitation with full capabilities returns [approve, reject]
- [x] 8.4.5 Unit test: sent invitation with no capabilities returns []
- [x] 8.4.6 Unit test: pending_approval with no approve capability returns [reject] only

### Contract 8.2: assertCanManageCollaborators

- [x] 8.2.1 Add CollaboratorManagementPermissionDeniedError to lib/invitations/errors.ts
- [x] 8.2.2 Implement assertCanManageCollaborators in app/lists/_actions/permissions.ts
- [x] 8.2.3 Integration test: passes for owner
- [x] 8.2.4 Integration test: throws for non-owner collaborator
- [x] 8.2.5 Integration test: throws for user not on list

### Contract 8.3: getCollaboratorManagementViewData

- [x] 8.3.1 Implement getCollaboratorManagementViewData in lib/invitations/service.ts
- [x] 8.3.2 Integration test: returns accepted collaborators, open invites, and pending_approval entries
- [x] 8.3.3 Integration test: excludes lists where actor is not owner
- [x] 8.3.4 Integration test: returns only owned lists when actor owns some but not all
- [x] 8.3.5 Integration test: returns empty when actor owns no lists
- [x] 8.3.6 Integration test: preserves authoritative invitationId identifiers

### Contract 8.1: loadCollaboratorManagementWorkflow

- [x] 8.1.1 Implement loadCollaboratorManagementWorkflow in lib/invitations/service.ts

### Contract 8.6: Management server actions

- [x] 8.6.1 Implement approveInvitation in app/lists/_actions/invitations.ts
- [x] 8.6.2 Implement rejectInvitation in app/lists/_actions/invitations.ts
- [x] 8.6.3 Implement revokeInvitation in app/lists/_actions/invitations.ts
- [x] 8.6.4 Integration test: approveInvitation transitions pending_approval to accepted and creates list_collaborators row
- [x] 8.6.5 Integration test: rejectInvitation transitions pending_approval to revoked without list_collaborators row
- [x] 8.6.6 Integration test: revokeInvitation transitions sent to revoked

### Contract 8.5: /lists/collaborators route

- [x] 8.5.1 Create app/lists/collaborators/page.tsx with auth redirect for unauthenticated users
- [x] 8.5.2 Page calls loadCollaboratorManagementWorkflow and renders list views
- [x] 8.5.3 Page renders accepted collaborators, open invitations, and pending_approval entries per list
- [x] 8.5.4 Page includes Invite by Email form using inviteCollaborator server action
- [x] 8.5.5 Page includes Approve/Reject buttons for pending_approval using server actions
- [x] 8.5.6 Page includes Revoke button for open invitations using server action

### Plan File Updates

- [x] 8.P.1 Check off Phase 4 automated gate items in thoughts/shared/plans/2026-03-10-email-invitation-system.md
- [x] 8.P.2 Check off Phase 8 automated gate items (typecheck, lint, test:unit, test:integration)
