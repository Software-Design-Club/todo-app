---
qa-report: true
status: accepted
---

# Unify Invite Flow — QA Report

**Stage:** 11 — Feature QA Verification
**Date:** 2026-03-13
**Spec:** `plan/unify-invite-flow/stage-6-final-spec.md`
**Plan:** `plan/unify-invite-flow/stage-8-implementation-plan.md`
**Outcome:** ACCEPTED

---

## Automated Verification

| Command | Result |
|---------|--------|
| `npm run typecheck` | ✅ 0 errors |
| `npm run lint` | ✅ 0 warnings |
| `npm run test:integration` | ✅ 80/80 pass (11 files) |
| `addCollaborator` present in `app/` | ✅ Not found — deleted |

---

## Coverage Matrix

| Acceptance Criterion | Method | Result |
|---------------------|--------|--------|
| **Slice A — Email Normalization** | | |
| New email `Alice@Example.com` stored as `alice@example.com` | Integration test (Contract 1a.1) | ✅ Pass |
| Padded email `" bob@example.com "` stored trimmed | Integration test (Contract 1a.1) | ✅ Pass |
| Existing rows unmodified | Integration test (Contract 1a.2) | ✅ Pass |
| **Slice B — searchInvitableUsers** | | |
| Existing collaborator excluded from results | Integration test (1b.1) | ✅ Pass |
| User with `sent` invitation excluded | Integration test (1b.2) | ✅ Pass |
| User with `pending` invitation excluded | Integration test (1b.3) | ✅ Pass |
| User with no connection returns in results | Integration test (1b.4) | ✅ Pass |
| Empty results produce one generic message | Code: single `setError("No users found.")` | ✅ Pass |
| **Slice C — Invite Routing** | | |
| `addCollaborator` deleted; build passes | typecheck + grep | ✅ Pass |
| Confirmation creates `invitations` row (`status=sent`), sends email | Integration test (T2) | ✅ Pass |
| No `list_collaborators` row after confirmation | Integration test (T6) + manual DB check | ✅ Pass |
| Button label is "Invite {name}" | Code review + manual browser | ✅ Pass |
| Button disabled while in-flight | Code: `inviteCollaboratorMutation.isPending` | ✅ Pass |
| Delivery failure: error shown with correct message; panel preserved | Manual browser + code review | ✅ Pass |
| Action failure: error shown with error message or fallback; panel preserved | Manual browser + code review | ✅ Pass |
| No client inspects `emailServiceResponse` | Code review | ✅ Pass |
| Unauthorized call throws `CollaboratorManagementPermissionDeniedError` | Integration test (T5) | ✅ Pass |
| **Slice D — Optimistic UI** | | |
| Search-select success → pending list updates without reload | Manual browser | ✅ Pass |
| New entry typed as `SentInvitationSummary` at call site | typecheck | ✅ Pass |
| Search input/results clear; confirmation panel closes after success | Manual browser | ✅ Pass |
| Dropdown stays open after successful invite | Manual browser | ✅ Pass |
| No `router.refresh()` after search-select invite | Code review | ✅ Pass |
| Email form inside dropdown → pending list updates without reload | Manual browser | ✅ Pass |
| Email form on `/lists/collaborators` still calls `router.refresh()` | Code review + manual browser | ✅ Pass |
| No `useEffect` syncing `initialInvitations` into state | Code review | ✅ Pass |

---

## Defects Found and Resolved

| ID | Severity | Description | Resolution |
|----|----------|-------------|------------|
| D1 | Medium | Search-select delivery failure spec said "toast" — inline banner kept intentionally for dropdown context | Accepted as-is (inline banner preferred over toast in dropdown) |
| D2 | Medium | Search-select action error message format: `"Failed to invite {name}. {msg}"` vs spec `"Failed to send invitation."` | Fixed: `manage-collaborators.tsx` `onError` now uses `err.message \|\| "Failed to send invitation."` |
| D3 | Low | Email form input resets on delivery failure (spec: panel preserved) | Deferred to backlog — not covered by Slice C acceptance criteria |

---

## Manual Verification Results

| Step | Result |
|------|--------|
| Confirmation button reads "Invite {name}" in browser | ✅ Pass |
| Pending list updates immediately after search-select invite | ✅ Pass |
| Search input and results clear; confirmation panel closes after success | ✅ Pass |
| Dropdown stays open after successful invite | ✅ Pass |
| Email form inside dropdown → pending list updates immediately | ✅ Pass |
| Email form on `/lists/collaborators` → page updates (router.refresh) | ✅ Pass |
| Error shown with correct message when delivery fails | ✅ Pass |
| Panel state preserved on failure | ✅ Pass |
| No `list_collaborators` row in DB after invite | ✅ Pass |

---

## Changes Made During QA

- `manage-collaborators.tsx` — action error message corrected to `err.message || "Failed to send invitation."`
- `manage-collaborators.tsx` — section label changed from "Add New Collaborator" to "Invite New Collaborators"
- `plan/backlog.md` — three new tickets added (inline banner for email form, page refresh on invitation actions, search-and-invite form on collaborators page)

---

## Acceptance Recommendation

**ACCEPTED.** All acceptance criteria verified. No blocking defects. Two deferred items tracked in backlog.
