# PR #8 Consolidated Fixes — Implementation Plan

## Overview

This plan consolidates the remaining work from the [original PR #8 review fixes plan](./2026-02-08-pr8-review-fixes.md) and the [code review](../../plan/invitation-system-code-review.md). It omits everything already implemented and adds newly discovered issues from the code review.

## Current State Analysis

**What's already done** (from the original plan):
- `lib/invitations/permissions.ts` deleted; `isAuthorizedToEditCollaborators` used instead
- Invitation server actions use `requireAuth()` and no longer accept `ownerUserId`
- Collaborator server actions use `requireAuth()`
- `ownerUserId` removed from `ManageCollaborators` props
- Resend upgraded to v6.9.1 with `webhooks.verify()` via Svix
- Webhook route uses Svix headers
- Status guard on `resendInvitation`
- Accepted-membership guard on `createOrRotateInvitation`
- Upsert replaces check-then-insert (TOCTOU fix)
- `lib/validation.ts` exists with `sanitizeRedirectTarget` and `isValidEmail`
- `lib/rate-limit.ts` exists
- `app/invite/page.tsx` guards nullable `session.user.email`
- `lib/invitations/constants.ts` with `INVITATION_STATUS` and `COLLABORATOR_ROLE`
- Clipboard write wrapped in try/catch
- Email delivery failure surfaced in UI

**What's broken or missing** (the scope of this plan):

| # | Category | Issue |
|---|----------|-------|
| A | **Critical: Build-breaking** | `require-auth.ts` does not exist but is imported everywhere |
| B | **Critical: Build-breaking** | `collaborators.ts` has merge-conflict syntax errors (duplicate imports, missing commas, duplicate keys, dead code) |
| C | **Critical: Build-breaking** | `list.ts:125` has same `and()` comma bug |
| D | **Critical: Build-breaking** | `sign-in/page.tsx` has duplicate function declarations (merge conflict artifact) |
| E | **Critical: Build-breaking** | `manage-collaborators.tsx` references `ListInvitation`, `createInvitationForList`, `resendInvitationForList`, `setCurrentInvitations`, `setInviteEmail` etc. without imports or state declarations |
| F | **Auth gap** | `list.ts` — only `updateListVisibility` uses `requireAuth()`; others still accept `userId` param |
| G | **Auth gap** | `todo.ts` — no `requireAuth()` at all |
| H | **Auth gap** | `app/api/todos/[id]/route.ts` — no todo ownership verification |
| I | **Missing test** | `tests/unit/permissions.test.ts` does not exist |
| J | **Missing index** | No DB index on `emailDeliveryProviderId` |
| K | **Code quality** | `console.log` statements in `collaborators.ts` (4) and `list.ts` (1) |
| L | **Security** | Webhook route swallows errors silently (no logging in catch) |
| M | **Security** | No webhook replay attack protection (timestamp age check) |
| N | **Security** | Token consumption race condition (no optimistic locking) |
| O | **Security** | No transaction boundaries around invitation creation + email sending |
| P | **Security** | Weak email validation (missing multiple-@ check) |
| Q | **Security** | Open redirect not fully fixed (`/\example.com` bypasses on some browsers) |
| R | **Security** | No token format validation on invite page |
| S | **Code quality** | Null checks missing in mutation `onSuccess` handlers |
| T | **Code quality** | Function ordering (`isOwnerAuthorizedForInvitationActions` defined after use) |
| U | **Code quality** | Error message quality in webhook route (technical event types as messages) |
| V | **Perf** | N+1 queries on collaborator management page |

### Key Discoveries:
- `require-auth.ts` does not exist at `app/lists/_actions/require-auth.ts` but is imported in `collaborators.ts:20`, `invitations.ts:33`, and `list.ts:303` — **the project cannot typecheck or build**
- `collaborators.ts` has at least 7 distinct merge-conflict artifacts — duplicate imports, missing commas in `and()` calls, duplicate object keys, malformed error handling, dead code after returns
- `list.ts:124-128` has the same comma-missing `and()` bug in a `leftJoin` clause
- `sign-in/page.tsx` has two `export default` declarations for `SignIn` (lines 4 and 11)
- `manage-collaborators.tsx` references invitation-related functions/types/state that were never imported or declared — the invitation UI integration is incomplete
- The Resend SDK's `webhooks.verify()` already handles timestamp validation internally via Svix, so issue M (replay protection) is **already handled** by the SDK — no additional application-level check needed
- Issue O (transaction boundaries) is intentionally not wrapped — email sending is an external call that shouldn't be in a DB transaction; the current pattern of creating the invitation then sending email then updating delivery status is the correct approach (invitation exists for manual retry if email fails)

## Desired End State

1. `npm run typecheck` passes with zero errors
2. `npm run lint` passes
3. `npm run build` succeeds
4. `npm run test:unit` and `npm run test:integration` pass
5. All server actions derive user identity from `auth()` — no client-supplied user IDs
6. All referenced modules exist and are properly imported
7. No merge-conflict artifacts remain in any file
8. Console.log statements removed from server actions
9. DB index on `emailDeliveryProviderId` for webhook lookups

### Verification:
```bash
npm run verify:all && npm run build
```

## What We're NOT Doing

- **Persistent rate limiting (Redis/KV)** — In-memory rate limiter is already implemented and acceptable for now (documented as known limitation in original plan)
- **Splitting `service.ts` into focused modules** — Architectural refactoring out of scope for a bug-fix PR
- **Separating invitations into a dedicated table** — Schema refactoring out of scope
- **Centralizing error messages** — Nice-to-have, not a bug
- **Adding JSDoc to public APIs** — Out of scope for this PR
- **Reducing UI mutation duplication** — Refactoring concern, not a fix
- **Standardizing type naming** — Out of scope
- **Replacing type assertions with conversion functions** — The `toInvitationId` pattern adds minimal value; branded type casts are acceptable
- **Transaction boundaries for email sending** — Intentionally not transactional (email is an external call; invitation record should persist for retry even if email fails)
- **Webhook replay protection** — Already handled by Resend SDK's `webhooks.verify()` (Svix validates timestamps internally)

## Implementation Approach

Fix in priority order: build-breaking → auth gaps → security → quality → perf. Test-driven where practical. Commit after each logical unit. Before every commit, run:

```bash
npm run verify:all
```

Then run:
```bash
npm run build
```

---

## Phase 1: Fix Build-Breaking Issues

**Issues addressed**: A, B, C, D, E

### Overview
Make the project compile. Fix all merge-conflict artifacts and missing files so `npm run typecheck` passes.

### Changes Required:

#### 1.1 Create `require-auth.ts`

**New file**: `app/lists/_actions/require-auth.ts`

```typescript
import "server-only";
import { auth } from "@/auth";
import type { User } from "@/lib/types";

interface AuthenticatedSession {
  user: {
    id: User["id"];
    email: User["email"];
    name: User["name"];
  };
}

export async function requireAuth(): Promise<AuthenticatedSession> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Authentication required.");
  }
  if (!session.user.email) {
    throw new Error("Authentication required: missing email.");
  }
  return session as AuthenticatedSession;
}
```

**jj commit**: "fix: create require-auth.ts helper (was imported but missing)"

#### 1.2 Fix `collaborators.ts` merge-conflict artifacts

**File**: `app/lists/_actions/collaborators.ts`

Rewrite the file cleanly:
1. Remove all duplicate imports (keep one set)
2. Fix both `and()` clauses (lines ~78 and ~234) — remove duplicate lines, add missing commas
3. Fix duplicate `listId` in `.values()` — keep only one
4. Fix duplicate `id` key in `createTaggedListUser()` call — use `inserted.userId`
5. Fix malformed error handling — proper brace nesting, remove orphaned if block
6. Remove dead code after `return []` in `getCollaborators`

**jj commit**: "fix: resolve merge conflict artifacts in collaborators.ts"

#### 1.3 Fix `list.ts` `and()` clause

**File**: `app/lists/_actions/list.ts`

Line 124-128: The `leftJoin` has the same comma-missing `and()` bug. Fix:

```typescript
.leftJoin(
  ListCollaboratorsTable,
  and(
    eq(ListsTable.id, ListCollaboratorsTable.listId),
    eq(ListCollaboratorsTable.inviteStatus, INVITATION_STATUS.ACCEPTED)
  )
)
```

Remove the duplicate `eq(ListsTable.id, ListCollaboratorsTable.listId)` line that lacks a comma.

**jj commit**: "fix: resolve merge conflict artifact in list.ts leftJoin"

#### 1.4 Fix `sign-in/page.tsx` duplicate function declarations

**File**: `app/sign-in/page.tsx`

Remove the orphaned first function declaration (line 4: `export default async function SignIn() {`) and keep the one with `searchParams`. Also ensure `sanitizeRedirectTarget` is actually used (pass `redirectTo` to the form or remove the import if unused).

```typescript
import SignInForm from "@/app/sign-in/_components/sign-in";
import { sanitizeRedirectTarget } from "@/lib/validation";

interface SignInPageProps {
  searchParams: Promise<{
    redirectTo?: string;
  }>;
}

export default async function SignIn({ searchParams }: SignInPageProps) {
  const { redirectTo } = await searchParams;
  const safeRedirect = sanitizeRedirectTarget(redirectTo);

  return (
    <div className="flex justify-center items-center h-screen">
      <SignInForm redirectTo={safeRedirect} />
    </div>
  );
}
```

Note: Check whether `SignInForm` accepts a `redirectTo` prop. If not, either add it or remove `sanitizeRedirectTarget` if the redirect is handled elsewhere.

**jj commit**: "fix: resolve merge conflict artifact in sign-in page"

#### 1.5 Fix `manage-collaborators.tsx` missing imports and state

**File**: `app/lists/_components/manage-collaborators.tsx`

The component references invitation-related types, functions, and state that are not imported or declared. Add:

1. **Import** `ListInvitation` type from `@/lib/types` (or wherever it's defined)
2. **Import** `createInvitationForList`, `resendInvitationForList`, `revokeInvitationForList`, `approveInvitationForList`, `rejectInvitationForList` from `@/app/lists/_actions/invitations`
3. **Add state**: `const [currentInvitations, setCurrentInvitations] = useState<ListInvitation[]>([]);`
4. **Add state**: `const [inviteEmail, setInviteEmail] = useState("");`
5. Update `ManageCollaboratorsProps` to accept `initialInvitations?: ListInvitation[]` if the parent provides them
6. Ensure all referenced handlers and computed values (like `invitationGroups`, `handleCreateInvitation`) are defined

This requires reading the full file to understand exactly what's referenced but missing.

**jj commit**: "fix: add missing imports and state for invitation UI in manage-collaborators"

### Success Criteria:

#### Automated Verification:
- [x] `npm run verify:all` passes
- [x] `npm run typecheck` passes with zero errors
- [x] `npm run lint` passes
- [x] `npm run build` succeeds

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Complete Authorization Gaps

**Issues addressed**: F, G, H

### Overview
Add `requireAuth()` to the remaining server actions that still accept client-supplied `userId`.

### Changes Required:

#### 2.1 Refactor remaining `list.ts` server actions

**File**: `app/lists/_actions/list.ts`

For each function that still accepts `userId` as a parameter:
- `createList`: Replace `formData.get("creatorId")` with `const { user } = await requireAuth()`, use `user.id`
- `updateListTitle`: Remove `userId` param, add `requireAuth()`
- `archiveList`: Remove `userId` param, add `requireAuth()`
- `unarchiveList`: Remove `userId` param, add `requireAuth()`
- `deleteList`: Remove `userId` param, add `requireAuth()`
- `getLists`: Add `requireAuth()`, derive userId internally

Keep `getList` and `getListWithTodos` as internal helpers.

Update all calling components to stop passing `userId`.

**jj commit**: "fix: derive user identity from auth() in list server actions"

#### 2.2 Add auth to `todo.ts` server actions

**File**: `app/lists/_actions/todo.ts`

All 5 functions need `requireAuth()` + collaborator membership verification:

```typescript
async function requireTodoAccess(todoId: Todo["id"]) {
  const { user } = await requireAuth();
  const db = drizzle(sql);
  const [todo] = await db.select().from(TodosTable).where(eq(TodosTable.id, todoId)).limit(1);
  if (!todo) throw new Error("Todo not found.");
  const collaborators = await getCollaborators(todo.listId as List["id"]);
  if (!userCanEditList(collaborators, user.id)) {
    throw new Error("You do not have permission to edit this list.");
  }
  return { user, todo };
}
```

For `createTodo` (has `listId`), check directly. For `updateTodoStatus`, `updateTodoTitle`, `deleteTodo` — use `requireTodoAccess`.

**jj commit**: "fix: add auth and authorization checks to todo server actions"

#### 2.3 Fix API route

**File**: `app/api/todos/[id]/route.ts`

After the existing `auth()` check, look up the todo's list and verify the user is a collaborator:

```typescript
const [todo] = await db.select().from(TodosTable).where(eq(TodosTable.id, parseInt(id))).limit(1);
if (!todo) return new NextResponse("Not found", { status: 404 });
const collaborators = await getCollaborators(todo.listId as List["id"]);
if (!userCanEditList(collaborators, session.user.id)) {
  return new NextResponse("Forbidden", { status: 403 });
}
```

**jj commit**: "fix: verify todo ownership in API route"

#### 2.4 Update client components

Remove `userId` props from components that were passing them to the refactored actions:
- `create-list.tsx` — remove `creatorId` prop
- `editable-list-title.tsx` — remove `userId` prop
- `visibility-toggle.tsx` — remove `userId` prop
- `user-lists-table.tsx` — remove `userId` from action calls
- Any parent components passing these props

**jj commit**: "refactor: remove userId props from client components"

### Success Criteria:

#### Automated Verification:
- [x] `npm run verify:all` passes
- [x] `npm run typecheck` passes
- [x] `npm run lint` passes
- [x] `npm run test:unit` passes
- [x] `npm run test:integration` passes
- [x] `npm run build` succeeds

---

## Phase 3: Security & Validation Hardening

**Issues addressed**: L, N, P, Q, R, S

### Overview
Fix security issues identified in the code review that go beyond what the original plan addressed.

### Changes Required:

#### 3.1 Add error logging to webhook catch block

**File**: `app/api/webhooks/resend/route.ts`

```typescript
} catch (error) {
  console.error("Webhook verification failed:", error);
  return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
}
```

**jj commit**: "fix: log webhook verification errors instead of swallowing"

#### 3.2 Add optimistic locking to token consumption

**File**: `lib/invitations/service.ts`

In `consumeInvitationToken`, change `updateInvitation` to include a WHERE clause that checks the current `inviteTokenHash` and `inviteStatus`:

Add a new repository method `updateInvitationOptimistic` that includes conditions:
```typescript
async updateInvitationOptimistic(
  invitationId: number,
  values: Partial<InvitationInsert>,
  conditions: { tokenHash: string; status: string }
): Promise<InvitationRow | null> {
  const [updated] = await db
    .update(ListCollaboratorsTable)
    .set({ ...values, updatedAt: new Date() })
    .where(
      and(
        eq(ListCollaboratorsTable.id, invitationId),
        eq(ListCollaboratorsTable.inviteTokenHash, conditions.tokenHash),
        eq(ListCollaboratorsTable.inviteStatus, conditions.status)
      )
    )
    .returning();
  return updated ?? null;
}
```

If the update returns null, the token was already consumed by another request.

**jj commit**: "fix: use optimistic locking in token consumption to prevent race condition"

#### 3.3 Strengthen email validation

**File**: `lib/validation.ts`

Update `isValidEmail` to catch multiple `@` symbols:

```typescript
export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  // RFC 5322 simplified — no spaces, exactly one @, content on both sides, dot in domain
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed);
}
```

**jj commit**: "fix: strengthen email validation regex"

#### 3.4 Strengthen redirect sanitization

**File**: `lib/validation.ts`

Use URL parsing for robust redirect validation:

```typescript
export function sanitizeRedirectTarget(redirectTo?: string): string {
  if (!redirectTo) return "/";
  try {
    const url = new URL(redirectTo, "http://localhost");
    if (url.protocol !== "http:" || url.hostname !== "localhost") {
      return "/";
    }
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
```

Update existing tests in `tests/unit/validation.test.ts`.

**jj commit**: "fix: use URL parsing for robust redirect sanitization"

#### 3.5 Add token format validation on invite page

**File**: `app/invite/page.tsx`

Before calling `acceptInvitationToken`, validate token format:

```typescript
const TOKEN_PATTERN = /^[a-zA-Z0-9_-]{20,128}$/;
if (!TOKEN_PATTERN.test(token)) {
  return <InvalidInvitationPage message="Invalid invitation link format." />;
}
```

**jj commit**: "fix: validate invitation token format before processing"

#### 3.6 Add null checks in mutation onSuccess handlers

**File**: `app/lists/_components/manage-collaborators.tsx`

Add defensive checks at the top of each `onSuccess` handler:

```typescript
onSuccess: (data) => {
  if (!data?.invitation) {
    setError("Invitation created but response was invalid.");
    return;
  }
  const { invitation } = data;
  // ... rest of logic
},
```

**jj commit**: "fix: add null checks in invitation mutation handlers"

### Success Criteria:

#### Automated Verification:
- [x] `npm run verify:all` passes
- [x] `npm run typecheck` passes
- [x] `npm run lint` passes
- [x] `npm run test:unit` passes (validation tests updated)
- [x] `npm run test:integration` passes
- [x] `npm run build` succeeds

---

## Phase 4: Code Quality & Performance

**Issues addressed**: I, J, K, T, U, V

### Overview
Add missing tests, remove debug logging, add DB index, fix code quality issues, batch N+1 queries.

### Changes Required:

#### 4.1 Add unit tests for permissions

**New file**: `tests/unit/permissions.test.ts`

Test all functions in `app/lists/_actions/permissions.ts`:
- `userCanEditList` — owner can edit, collaborator can edit, non-member cannot
- `isAuthorizedToEditCollaborators` — owner can, collaborator cannot
- `isListOwner` — owner returns true, collaborator returns false
- `canBeRemovedAsCollaborator` — owner cannot be removed, collaborator can
- `isAuthorizedToChangeVisibility` — owner can, collaborator cannot
- `canViewList` — member can view, non-member cannot

Use `buildListUser` helper pattern from existing tests.

**jj commit**: "test: add unit tests for permission functions"

#### 4.2 Remove console.log statements

**File**: `app/lists/_actions/collaborators.ts` — remove 4 console.log statements
**File**: `app/lists/_actions/list.ts` — remove `console.log("inside updateVisibility")`

**jj commit**: "chore: remove debug console.log statements from server actions"

#### 4.3 Add missing DB index on `emailDeliveryProviderId`

**File**: `drizzle/schema.ts`

Add to the `ListCollaboratorsTable` indexes:

```typescript
emailDeliveryProviderIdIndex: index(
  "list_collaborators_email_delivery_provider_id_idx"
).on(collaborators.emailDeliveryProviderId),
```

**New file**: `drizzle/0007_email_delivery_provider_id_index.sql`

```sql
CREATE INDEX "list_collaborators_email_delivery_provider_id_idx" ON "list_collaborators" ("emailDeliveryProviderId");
```

Run `npx drizzle-kit push` to apply.

**jj commit**: "perf: add index on emailDeliveryProviderId for webhook lookups"

#### 4.4 Fix function ordering in invitations.ts

**File**: `app/lists/_actions/invitations.ts`

Move `isOwnerAuthorizedForInvitationActions` definition (lines 44-49) to before its first use (line 38), or inline it into `assertOwnerAccess` since it's a trivial wrapper.

**jj commit**: "refactor: fix function ordering in invitations.ts"

#### 4.5 Improve webhook error message quality

**File**: `app/api/webhooks/resend/route.ts`

Map technical event types to human-readable messages:

```typescript
const EVENT_DESCRIPTIONS: Record<string, string> = {
  "email.bounced": "Email bounced — recipient address invalid",
  "email.complained": "Email marked as spam by recipient",
  "email.delivery_delayed": "Email delivery delayed",
  "email.failed": "Email delivery failed",
};

const errorMessage =
  ("reason" in data ? (data.reason as string) : undefined)
  ?? EVENT_DESCRIPTIONS[payload.type]
  ?? payload.type;
```

**jj commit**: "fix: improve webhook error messages with human-readable descriptions"

#### 4.6 Batch N+1 queries on collaborator management page

**File**: `app/lists/_actions/collaborators.ts`

Add a batch function `getCollaboratorsForLists(listIds)` that fetches all collaborators for multiple lists in a single query using `inArray`.

**File**: `lib/invitations/service.ts`

Add `listInvitationsForLists({ listIds, statuses? })` with a corresponding repository method `listInvitationsByListIds`.

**File**: `app/lists/collaborators/page.tsx`

Replace per-list Promise.all loop with batch queries, reducing from 1+3N to 3 queries.

**jj commit**: "perf: batch collaborator and invitation queries to fix N+1"

### Success Criteria:

#### Automated Verification:
- [x] `npm run verify:all` passes
- [x] `npm run typecheck` passes
- [x] `npm run lint` passes
- [x] `npm run test:unit` passes (new permission tests)
- [x] `npm run test:integration` passes
- [x] `npm run build` succeeds

---

## Testing Strategy

### Unit Tests (`tests/unit/`):
- `permissions.test.ts` — **new** (Phase 4.1)
- `validation.test.ts` — **update** existing tests for strengthened email/redirect validation (Phase 3)
- `rate-limit.test.ts` — existing (unchanged)
- `invitations/token.test.ts` — existing (unchanged)

### Integration Tests (`tests/integration/`):
- `invitations/service.test.ts` — existing (unchanged)
- `invitations/webhook.test.ts` — existing (unchanged)
- `invitations/owner-ui-actions.test.ts` — existing (unchanged)
- `invitations/acceptance.test.ts` — existing (unchanged)
- `invitations/lifecycle-hooks.test.ts` — existing (unchanged)

### E2E Tests (`tests/e2e/`):
- Existing tests should continue passing

## Performance Considerations

- **Batch queries** (Phase 4.6): Reduces collaborator page from 1+3N to 3 queries
- **emailDeliveryProviderId index** (Phase 4.3): Eliminates full table scan on webhook receipt

## Migration Notes

- **Migration 0007**: Adds index only — safe to apply, no data changes, no downtime
- **Breaking client changes**: `userId` prop removal in Phase 2 requires updating all parent components in the same commit

## Manual QA Checklist

After all 4 phases are complete and all automated checks pass:

### Phase 1: Build
- [x] `npm run typecheck` passes with zero errors
- [x] `npm run build` produces a production build successfully
- [x] Dev server starts without errors

### Phase 2: Authorization
- [x] Creating a list works without passing creatorId
- [ ] Managing collaborators works (invite, resend, revoke, approve, reject)
- [ ] Accepting an invitation via `/invite?token=...` works
- [x] Editing a todo as a collaborator works
- [ ] Editing a todo as a non-collaborator fails with error
- [ ] Archiving/unarchiving/deleting a list works for the owner

### Phase 3: Security
- [ ] `/sign-in?redirectTo=//evil.com` redirects to `/`
- [ ] `/sign-in?redirectTo=/\evil.com` redirects to `/`
- [ ] Inviting "notanemail" shows validation error
- [ ] Invalid token format on invite page shows error

### Phase 4: Quality
- [ ] Collaborator management page loads correctly (N+1 fix didn't break)
- [ ] No console.log statements appear in server action output

## References

- Original PR #8 plan: `thoughts/shared/plans/2026-02-08-pr8-review-fixes.md`
- Code review: `plan/invitation-system-code-review.md`
- Invitation service: `lib/invitations/service.ts`
- Permissions: `app/lists/_actions/permissions.ts`
- In-memory test repo: `tests/integration/invitations/in-memory-repo.ts`
