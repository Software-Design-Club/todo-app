# PR #8 Review Fixes Implementation Plan

## Overview

Apply all 25 fixes from the PR #8 review (20 original issues + 5 newly discovered) across 5 phases. The work is test-driven: write failing tests first, then implement the fix, then verify. Commit after each logical unit of work using `jj`.

## Current State Analysis

- **Authorization**: No server action calls `auth()`. All receive caller-supplied `userId` as a parameter. The `ManageCollaborators` component passes `ownerUserId` as a prop from parent server components that do call `auth()`.
- **Webhook verification**: Uses custom HMAC-SHA256 with `x-resend-signature` header — completely wrong for Resend (which uses Svix). Resend SDK is v4.8.0, which lacks `webhooks.verify()`.
- **Invitation service**: Uses check-then-insert (TOCTOU) instead of upsert. `resendInvitation` has no status guard. No accepted-membership guard exists.
- **Input validation**: Open redirect via `//` in sign-in. No server-side email validation. Nullable `session.user.email` unchecked.
- **Code quality**: Magic enum indexes, inconsistent error handling, debug `console.log`, uncaught clipboard errors, duplicate permission functions, N+1 queries.

### Key Discoveries:
- `permissions.ts` is NOT a `"use server"` file — it's imported by client components (`collaborator-list-item.tsx` uses `canBeRemovedAsCollaborator`). Adding `auth()` imports directly will break client bundles. Solution: dynamic import or conditional export.
- `lib/invitations/permissions.ts` contains only `canManageInvitations`, which checks `Role === "owner"` — the same check as `isAuthorizedToEditCollaborators`. Since managing invitations IS editing collaborators, `canManageInvitations` will be deleted and replaced with `isAuthorizedToEditCollaborators` (which is extensible via the `ALLOWED_TO_EDIT_COLLABORATORS_ROLES` array).
- Existing test infrastructure: Vitest (unit + integration) with in-memory repository pattern, Playwright for e2e. Tests follow `describe`/`it` with inline `buildListUser`/`buildInvitation` helpers.
- `resend@4.8.0` does NOT have `webhooks.verify()`. Must upgrade to `resend@^6.8.0` (which adds svix as a dependency automatically).

## Desired End State

After this plan is complete:
1. Every server action derives the acting user from `auth()` — no client-supplied user IDs for identity
2. Webhook signature verification uses the correct Svix-based algorithm via Resend SDK v6+
3. Invitation creation uses upsert (no TOCTOU), resend has status guards, accepted members can't be re-invited
4. Open redirect is blocked, emails are validated server-side, null session fields are guarded
5. Named enum constants replace magic indexes, error handling is consistent, N+1 queries are batched
6. All changes are covered by tests

### Verification:
```bash
npm run verify:all   # typecheck + lint + unit + integration + e2e
npm run build        # production build succeeds
```

## What We're NOT Doing

- **Rate limiting infrastructure** — Basic in-memory rate limiting for email actions IS included (Phase 4), but no Redis/external store
- **Replacing the two-tier auth pattern entirely** — Server components still call `auth()` and pass data to client components. We're only fixing the server action trust boundary.
- **Migrating collaborators to the repository pattern** — Out of scope (architectural concern from review, not a bug)
- **Replacing useState+useEffect sync with React Query cache** — Out of scope (architectural concern)

## Implementation Approach

Test-driven, commit-per-unit. Each phase writes tests first, then implements the fix. Before every `jj` commit, run:

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run test:integration
```

**Commit discipline**:
- Never commit typecheck failures or linting errors
- Only commit test failures if the commit is a test-only commit (TDD red step — adding failing tests before implementation)
- If implementation causes test failures, do NOT commit — fix the implementation until tests pass
- If automated checks pass, proceed to the next phase without waiting for manual verification

---

## Phase 1: Authorization Foundation

**Issues addressed**: #1, #2, New A, New B, New E (partial)

### Overview
Add `requireAuth()` as a server-only helper, delete `lib/invitations/permissions.ts` (replace with existing `isAuthorizedToEditCollaborators`), refactor all server actions to derive user identity from `auth()`, remove `ownerUserId` prop from client components.

### Changes Required:

#### 1.1 Add `requireAuth()` and delete `lib/invitations/permissions.ts`

**New file**: `app/lists/_actions/require-auth.ts`

This is a separate file from `permissions.ts` because `permissions.ts` is imported by client components (`collaborator-list-item.tsx` uses `canBeRemovedAsCollaborator`). Putting `auth()` in `permissions.ts` would break client bundles.

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

**File**: `app/lists/_actions/permissions.ts`

Keep ALL existing functions unchanged:
- `userCanEditList` — stays as-is
- `isAuthorizedToEditCollaborators` — stays as-is (this replaces `canManageInvitations` for invitation management)
- `isListOwner` — stays as-is
- `canBeRemovedAsCollaborator` — stays as-is
- `isAuthorizedToChangeVisibility` — stays as-is (distinct capability from `isListOwner`, may diverge later)
- `canViewList` — stays as-is

No changes to this file.

**File**: `lib/invitations/permissions.ts`

Delete this file entirely. Its sole function `canManageInvitations` is equivalent to `isAuthorizedToEditCollaborators` — both check that the user has an owner role. Using `isAuthorizedToEditCollaborators` is better because it's extensible via the `ALLOWED_TO_EDIT_COLLABORATORS_ROLES` array (e.g., if we later allow collaborators to manage invitations, we just add to the array).

**File**: `app/lists/_actions/invitations.ts`

Update import (line 18): replace `import { canManageInvitations } from "@/lib/invitations/permissions"` with `import { isAuthorizedToEditCollaborators } from "./permissions"`.

Update `isOwnerAuthorizedForInvitationActions` (line 38-43): replace `canManageInvitations(collaborators, userId)` with `isAuthorizedToEditCollaborators(collaborators, userId)`.

**File**: `tests/integration/invitations/owner-ui-actions.test.ts`

Update import (line 3): replace `import { canManageInvitations } from "@/lib/invitations/permissions"` with `import { isAuthorizedToEditCollaborators } from "@/app/lists/_actions/permissions"`.

Update test assertions (lines 60-61): replace `canManageInvitations(...)` with `isAuthorizedToEditCollaborators(...)`.

**jj commit**: "refactor: add requireAuth helper, replace canManageInvitations with isAuthorizedToEditCollaborators"

#### 1.2 Tests for permissions

**File**: `tests/unit/permissions.test.ts` (new)

```typescript
import { describe, expect, it } from "vitest";
import {
  userCanEditList,
  isAuthorizedToEditCollaborators,
  isListOwner,
  canBeRemovedAsCollaborator,
  isAuthorizedToChangeVisibility,
  canViewList,
} from "@/app/lists/_actions/permissions";
// Test that isAuthorizedToEditCollaborators works for invitation management
// (this is what replaced canManageInvitations)
// Test all existing permission functions still work correctly
// Use buildListUser helper pattern from owner-ui-actions.test.ts
```

**jj commit**: "test: add unit tests for permission functions"

#### 1.3 Refactor invitation server actions

**File**: `app/lists/_actions/invitations.ts`

For every exported function that currently accepts `ownerUserId`:
1. Remove `ownerUserId` from the params type
2. Add `const { user } = await requireAuth()` at the top
3. Pass `user.id` to `assertOwnerAccess` and downstream functions
4. For `acceptInvitationToken`: remove `userId`/`userEmail` params, derive from `requireAuth()`

The `assertOwnerAccess` helper stays but now calls `requireAuth()` internally and uses `isAuthorizedToEditCollaborators` (since managing invitations = editing collaborators):

```typescript
async function assertOwnerAccess(listId: List["id"]) {
  const { user } = await requireAuth();
  const collaborators = await getCollaborators(listId);
  if (!isAuthorizedToEditCollaborators(collaborators, user.id)) {
    throw new Error("Only the list owner can manage invitations.");
  }
  return user;
}
```

Each action becomes:
```typescript
export async function createInvitationForList(params: {
  listId: List["id"];
  invitedEmail: string;
}) {
  const user = await assertOwnerAccess(params.listId);
  // ... rest uses user.id instead of params.ownerUserId
}
```

For `acceptInvitationToken`:
```typescript
export async function acceptInvitationToken(params: {
  inviteToken: string;
}) {
  const { user } = await requireAuth();
  return consumeInvitationToken({
    inviteToken: params.inviteToken,
    userId: user.id,
    userEmail: user.email,
  });
}
```

**jj commit**: "fix: derive user identity from auth() in invitation server actions"

#### 1.4 Refactor collaborator server actions

**File**: `app/lists/_actions/collaborators.ts`

- `searchUsers`: Add `await requireAuth()` at top (no list-level check needed)
- `addCollaborator`: Add `const { user } = await requireAuth()` + `isAuthorizedToEditCollaborators` check
- `getCollaborators`: Add `await requireAuth()` at top
- `removeCollaborator`: Add `const { user } = await requireAuth()` + check that caller is owner or is removing themselves

**jj commit**: "fix: add auth checks to collaborator server actions"

#### 1.5 Refactor list server actions

**File**: `app/lists/_actions/list.ts`

- `createList`: Replace `formData.get("creatorId")` with `const { user } = await requireAuth()`, use `user.id` as `creatorId`
- `updateListTitle`: Remove `userId` param, add `requireAuth()`, use `session.user.id`
- `updateListVisibility`: Remove `userId` param, add `requireAuth()`, keep using `isAuthorizedToChangeVisibility` (distinct capability, may diverge from ownership later)
- `archiveList`: Remove `userId` param, add `requireAuth()`
- `unarchiveList`: Remove `userId` param, add `requireAuth()`
- `deleteList`: Remove `userId` param, add `requireAuth()`
- `getLists`: Add `requireAuth()`, derive userId internally (remove param)
- `getList`, `getListWithTodos`: Leave as internal helpers (no direct client exposure), but consider adding auth if called from client

**jj commit**: "fix: derive user identity from auth() in list server actions"

#### 1.6 Refactor todo server actions

**File**: `app/lists/_actions/todo.ts`

All 5 functions need `requireAuth()` + collaborator membership verification:

```typescript
export async function createTodo(
  todo: Pick<Todo, "title" | "status" | "listId">
) {
  const { user } = await requireAuth();
  const collaborators = await getCollaborators(todo.listId);
  if (!userCanEditList(collaborators, user.id)) {
    throw new Error("You do not have permission to edit this list.");
  }
  // ... existing logic
}
```

For `updateTodoStatus`, `updateTodoTitle`, `deleteTodo` — these accept a `todoId` but not a `listId`. They need to look up the todo first to get the `listId`, then check membership. Add a helper:

```typescript
async function requireTodoAccess(todoId: Todo["id"]): Promise<{ user: AuthenticatedSession["user"]; todo: Todo }> {
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

**jj commit**: "fix: add auth and authorization checks to todo server actions"

#### 1.7 Fix API route

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

#### 1.8 Update client components

**File**: `app/lists/_components/manage-collaborators.tsx`
- Remove `ownerUserId` from `ManageCollaboratorsProps` (line 24)
- Remove `ownerUserId` from destructured props (line 31)
- Remove `ownerUserId` from all server action call objects (lines 130, 167, 207, 231, 255)

**File**: `app/lists/_components/list.tsx`
- Remove `ownerUserId={user!.id}` from `<ManageCollaborators>` (line 121)
- Keep `isAuthorizedToChangeVisibility` usage (line 54) — distinct capability, unchanged
- Remove `userId` prop from `<EditableListTitle>` (line 92) — the action now gets it from auth
- Remove `userId` prop from `<VisibilityToggle>` (line 107) — same

**File**: `app/lists/collaborators/page.tsx`
- Remove `ownerUserId={userId}` from `<ManageCollaborators>` (line 56)
- Remove `ownerUserId: userId` from `getInvitationsForList` call (line 25)

**File**: `app/invite/page.tsx`
- Remove `userId` and `userEmail` from `acceptInvitationToken` call (lines 35-36)
- Simplify to `acceptInvitationToken({ inviteToken: token })`

**File**: `app/lists/_components/create-list.tsx`
- Remove `creatorId` prop (line 8)
- Remove `formData.set("creatorId", ...)` (line 21)
- Update parent components that pass `creatorId`

**File**: `app/lists/_components/editable-list-title.tsx`
- Remove `userId` prop from interface and call to `updateListTitle`

**File**: `app/lists/_components/visibility-toggle.tsx`
- Remove `userId` prop from interface and call to `updateListVisibility`

**File**: `app/lists/_components/user-lists-table.tsx`
- Remove `userId` prop/param from calls to `archiveList`, `unarchiveList`, `deleteList`

**jj commit**: "refactor: remove ownerUserId/userId props from client components"

### Success Criteria:

#### Automated Verification:
- [x] `npm run typecheck` passes (no type errors from removed props)
- [x] `npm run lint` passes
- [x] `npm run test:unit` passes (new permission tests + existing)
- [x] `npm run test:integration` passes (updated imports for canManageInvitations → isAuthorizedToEditCollaborators)
- [x] `npm run build` succeeds

---

## Phase 2: Webhook Verification

**Issues addressed**: #3, #4

### Overview
Upgrade `resend` to v6+, replace the broken custom verification with the SDK's `webhooks.verify()`, make the webhook secret required.

### Changes Required:

#### 2.1 Write failing tests for correct webhook verification

**File**: `tests/integration/invitations/webhook.test.ts`

Add tests that validate the webhook route behavior:
- Test: webhook request without `RESEND_WEBHOOK_SECRET` set returns 503
- Test: valid Svix-signed payload is accepted (mock using svix library)
- Test: invalid signature is rejected with 401
- Test: missing Svix headers returns 401

Since the webhook route handler is a Next.js API route, test the verification logic in isolation by extracting it to a testable function.

**jj commit**: "test: add webhook signature verification tests"

#### 2.2 Upgrade resend and install svix

```bash
npm install resend@^6.8.0
```

The `svix` package is automatically installed as a transitive dependency of `resend@6+`.

**jj commit**: "chore: upgrade resend to v6 for webhook verification support"

#### 2.3 Replace verification in `lib/email/resend.ts`

**File**: `lib/email/resend.ts`

Remove `verifyResendWebhookSignature` function (lines 25-42) and its `createHmac`/`timingSafeEqual` imports (line 2).

Add a new verification function using the Resend SDK:

```typescript
import { Resend } from "resend";

export function verifyWebhookPayload(params: {
  payload: string;
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
  webhookSecret: string;
}): Record<string, unknown> {
  const config = getEmailConfig();
  const resend = new Resend(config.apiKey);
  return resend.webhooks.verify({
    payload: params.payload,
    headers: {
      id: params.svixId,
      timestamp: params.svixTimestamp,
      signature: params.svixSignature,
    },
    webhookSecret: params.webhookSecret,
  }) as Record<string, unknown>;
}
```

**jj commit**: "fix: replace broken webhook verification with Resend SDK webhooks.verify"

#### 2.4 Update webhook route handler

**File**: `app/api/webhooks/resend/route.ts`

Replace the entire POST handler:

```typescript
export async function POST(request: NextRequest) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Webhook secret not configured." },
      { status: 503 }
    );
  }

  const rawPayload = await request.text();
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: "Missing webhook signature headers." },
      { status: 401 }
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = verifyWebhookPayload({
      payload: rawPayload,
      svixId,
      svixTimestamp,
      svixSignature,
      webhookSecret,
    });
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  // ... rest of handler (event type check, providerId extraction, etc.) stays the same
  // but now uses the verified `payload` directly instead of re-parsing
}
```

**jj commit**: "fix: require webhook secret and use Svix headers for verification"

### Success Criteria:

#### Automated Verification:
- [x] `npm run typecheck` passes
- [x] `npm run test:unit` passes
- [x] `npm run test:integration` passes (webhook tests pass)
- [x] `npm run build` succeeds

---

## Phase 3: Data Integrity

**Issues addressed**: #5, #7, #10, #19

### Overview
Fix the TOCTOU race condition with an upsert, add status guard to `resendInvitation`, add accepted-membership guard, add missing DB index.

### Changes Required:

#### 3.1 Write failing tests

**File**: `tests/integration/invitations/service.test.ts`

Add tests:
- Test: `resendInvitation` on a revoked invite throws "Only open invitations can be resent."
- Test: `resendInvitation` on an accepted invite throws "Only open invitations can be resent."
- Test: `createOrRotateInvitation` for an email that's already an accepted collaborator throws
- Test: concurrent duplicate `createOrRotateInvitation` calls don't create duplicate rows (in-memory repo won't catch this, but the logic change can still be tested)

**jj commit**: "test: add failing tests for data integrity guards"

#### 3.2 Add status guard to `resendInvitation`

**File**: `lib/invitations/service.ts`

After line 283 (after confirming invite exists), add:

```typescript
if (!OPEN_INVITATION_STATUSES.includes(existingInvite.inviteStatus)) {
  throw new Error("Only open invitations can be resent.");
}
```

**jj commit**: "fix: add status guard to resendInvitation"

#### 3.3 Add accepted-membership guard to `createOrRotateInvitation`

**File**: `lib/invitations/service.ts`

Add a new repository method `findAcceptedByEmail`:

```typescript
// In InvitationRepository interface:
findAcceptedByEmail(
  listId: List["id"],
  invitedEmailNormalized: string
): Promise<InvitationRow | null>;
```

Implement in `DrizzleInvitationRepository` and `InMemoryInvitationRepository`.

In `createOrRotateInvitation`, before the existing `findOpenByEmail` call (line 220), add:

```typescript
const existingAccepted = await invitationRepo.findAcceptedByEmail(
  params.listId,
  invitedEmailNormalized
);
if (existingAccepted) {
  throw new Error("This email is already an accepted collaborator on this list.");
}
```

**jj commit**: "fix: guard against re-inviting accepted collaborators"

#### 3.4 Add missing index on `emailDeliveryProviderId`

**File**: `drizzle/schema.ts`

Add to the `ListCollaboratorsTable` indexes (after line 118):

```typescript
emailDeliveryProviderIdIndex: index(
  "list_collaborators_email_delivery_provider_id_idx"
).on(collaborators.emailDeliveryProviderId),
```

**New file**: `drizzle/0007_email_delivery_provider_id_index.sql`

```sql
CREATE INDEX "list_collaborators_email_delivery_provider_id_idx" ON "list_collaborators" ("emailDeliveryProviderId");
```

**Run the migration**:
```bash
npx drizzle-kit push
```

Verify the migration applied cleanly before committing.

**jj commit**: "perf: add index on emailDeliveryProviderId for webhook lookups"

#### 3.5 Convert createOrRotateInvitation to use upsert (TOCTOU fix)

**File**: `lib/invitations/service.ts`

The TOCTOU fix is complex because the partial unique index `list_collaborators_open_invite_email_unique` uses a WHERE clause. Drizzle's `onConflictDoUpdate` can target this. Replace the check-then-insert pattern in `createOrRotateInvitation` (lines 220-253) with:

```typescript
// Instead of findOpenByEmail → conditionally insert or update,
// use INSERT ... ON CONFLICT DO UPDATE targeting the partial unique index
const [invitation] = await db
  .insert(ListCollaboratorsTable)
  .values({
    listId: params.listId,
    ...commonValues,
  })
  .onConflictDoUpdate({
    target: [ListCollaboratorsTable.listId, ListCollaboratorsTable.invitedEmailNormalized],
    targetWhere: sql`${ListCollaboratorsTable.inviteStatus} IN ('sent', 'pending_owner_approval') AND ${ListCollaboratorsTable.invitedEmailNormalized} IS NOT NULL`,
    set: commonValues,
  })
  .returning();
```

Note: This requires modifying the repository interface to support upsert, or performing the upsert at the repository level. The repository method `createInvitation` should be extended or a new `upsertInvitation` method added.

Since the in-memory repo can't truly simulate `ON CONFLICT`, keep the existing check-then-act logic in `InMemoryInvitationRepository` (it's sufficient for single-threaded test correctness). The Drizzle implementation gets the real upsert.

**jj commit**: "fix: use upsert to prevent TOCTOU race in invitation creation"

### Success Criteria:

#### Automated Verification:
- [x] `npm run typecheck` passes
- [x] `npm run test:unit` passes
- [x] `npm run test:integration` passes (new service tests pass)
- [x] `npm run build` succeeds

---

## Phase 4: Input Validation & Security Hardening

**Issues addressed**: #6, #8, #11, New C

### Overview
Fix the open redirect, add server-side email validation, guard nullable session fields, add basic rate limiting to email-sending actions.

### Changes Required:

#### 4.1 Write failing tests

**File**: `tests/unit/validation.test.ts` (new)

- Test: `sanitizeRedirectTarget("//evil.com")` returns `"/"`
- Test: `sanitizeRedirectTarget("//")` returns `"/"`
- Test: `sanitizeRedirectTarget("/valid/path")` returns `"/valid/path"`
- Test: `isValidEmail("user@example.com")` returns true
- Test: `isValidEmail("not-an-email")` returns false
- Test: `isValidEmail("")` returns false

**jj commit**: "test: add validation tests for redirect and email"

#### 4.2 Fix open redirect

**File**: `app/sign-in/page.tsx`

Change `sanitizeRedirectTarget` (line 15):

```typescript
function sanitizeRedirectTarget(redirectTo?: string): string {
  if (!redirectTo) {
    return "/";
  }
  if (!redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
    return "/";
  }
  return redirectTo;
}
```

Extract to a shared utility if used elsewhere, or keep inline since it's only used here.

**jj commit**: "fix: block protocol-relative URLs in redirect target"

#### 4.3 Add email validation

**File**: `app/lists/_actions/invitations.ts`

Add validation before `assertOwnerAccess` in `createInvitationForList`:

```typescript
function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  // Basic structural check — @ sign with content on both sides
  const atIndex = trimmed.indexOf("@");
  if (atIndex < 1 || atIndex === trimmed.length - 1) return false;
  const domain = trimmed.slice(atIndex + 1);
  if (!domain.includes(".")) return false;
  return true;
}

export async function createInvitationForList(params: {
  listId: List["id"];
  invitedEmail: string;
}) {
  const trimmedEmail = params.invitedEmail.trim();
  if (!isValidEmail(trimmedEmail)) {
    throw new Error("Please enter a valid email address.");
  }
  // ... rest of function
}
```

**jj commit**: "fix: add server-side email validation for invitations"

#### 4.4 Guard nullable session.user.email in invite page

**File**: `app/invite/page.tsx`

This is largely resolved by Phase 1 (acceptInvitationToken now calls requireAuth internally, which checks for email). But add explicit UI handling just in case:

After `auth()` check (line 29), before calling `acceptInvitationToken`:
```typescript
if (!session.user.email) {
  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold">Account error</h1>
      <p className="mt-3 text-muted-foreground">
        Your account is missing an email address. Please sign in with a provider that includes email.
      </p>
    </div>
  );
}
```

**jj commit**: "fix: guard nullable session.user.email in invite page"

#### 4.5 Add basic rate limiting for email-sending actions

**File**: `lib/rate-limit.ts` (new)

Simple in-memory sliding window rate limiter:

```typescript
const windows = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
}): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = windows.get(params.key);

  if (!entry || now >= entry.resetAt) {
    windows.set(params.key, { count: 1, resetAt: now + params.windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= params.limit) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true, retryAfterMs: 0 };
}
```

**File**: `app/lists/_actions/invitations.ts`

Add to `createInvitationForList` and `resendInvitationForList`:

```typescript
const { allowed } = checkRateLimit({
  key: `invite:${user.id}`,
  limit: 10,
  windowMs: 60_000, // 10 invitations per minute per user
});
if (!allowed) {
  throw new Error("Too many invitations. Please wait before trying again.");
}
```

**File**: `tests/unit/rate-limit.test.ts` (new)

Test the rate limiter in isolation.

**jj commit**: "feat: add basic rate limiting for email-sending actions"

### Success Criteria:

#### Automated Verification:
- [x] `npm run typecheck` passes
- [x] `npm run test:unit` passes (validation + rate limit tests)
- [x] `npm run test:integration` passes
- [x] `npm run build` succeeds

---

## Phase 5: Code Quality

**Issues addressed**: #9, #12, #13, #14, #15, #16, #17, #18, #20

### Overview
Named enum constants, standardize error handling, remove console.log, fix clipboard try/catch, surface email failures in UI, add index comment, fix N+1 queries.

### Changes Required:

#### 5.1 Replace magic array indexes with named constants

**File**: `lib/invitations/constants.ts` (new)

```typescript
import { InvitationStatusEnum, CollaboratorRoleEnum } from "@/drizzle/schema";

export const INVITATION_STATUS = {
  SENT: InvitationStatusEnum.enumValues[0],
  ACCEPTED: InvitationStatusEnum.enumValues[1],
  PENDING_OWNER_APPROVAL: InvitationStatusEnum.enumValues[2],
  REVOKED: InvitationStatusEnum.enumValues[3],
  EXPIRED: InvitationStatusEnum.enumValues[4],
} as const;

export const COLLABORATOR_ROLE = {
  OWNER: CollaboratorRoleEnum.enumValues[0],
  COLLABORATOR: CollaboratorRoleEnum.enumValues[1],
} as const;
```

Replace all `InvitationStatusEnum.enumValues[N]` references in:
- `lib/invitations/service.ts` (lines 228, 293, 345, 381, 418, 502, 518, 519)
- `app/lists/_actions/collaborators.ts` (lines 73, 95, 154, 187)
- `app/lists/_actions/permissions.ts` (lines 5, 7)
- `app/lists/_actions/list.ts` (line 129)

**jj commit**: "refactor: replace magic enum indexes with named constants"

#### 5.2 Standardize error handling

**File**: `app/lists/_actions/collaborators.ts`

Change `searchUsers` and `getCollaborators` to throw on error instead of returning empty arrays:

```typescript
// In searchUsers catch block (line 46-50):
throw new Error("Failed to search users. Please try again.");

// In getCollaborators catch block (line 163-165):
throw new Error("Failed to load collaborators.");
```

**File**: `app/lists/_components/manage-collaborators.tsx`

The `handleSearch` function (line 274) already has try/catch around `searchUsers`, so it will handle the thrown error. No change needed there.

**jj commit**: "fix: standardize error handling to always throw on DB errors"

#### 5.3 Remove console.log statements

**File**: `app/lists/_actions/collaborators.ts`

Remove all 8 `console.log` statements (lines 19, 58-59, 80-81, 100-101, 136, 170-171, 196-197, 202-203).

**File**: `app/lists/_actions/list.ts`

Remove `console.log("inside updateVisibility")` (line 315).

**File**: `app/api/todos/[id]/route.ts`

Remove `console.error` (line 32) or replace with structured logging if needed.

**jj commit**: "chore: remove debug console.log statements from server actions"

#### 5.4 Wrap clipboard write in try/catch

**File**: `app/lists/_components/manage-collaborators.tsx`

In `resendInvitationMutation.onSuccess` (line 184-186):

```typescript
if (copyAfterResend) {
  try {
    await navigator.clipboard.writeText(inviteLink);
    setSuccessMessage("Invite link copied to clipboard.");
  } catch {
    setSuccessMessage("Could not copy to clipboard. Link: " + inviteLink);
  }
}
```

**jj commit**: "fix: handle clipboard write failure gracefully"

#### 5.5 Surface email delivery failures in UI

**File**: `app/lists/_components/manage-collaborators.tsx`

In `createInvitationMutation.onSuccess` (line 133), check delivery status:

```typescript
onSuccess: ({ invitation, inviteLink }) => {
  // ... existing invitation state update ...

  if (invitation.emailDeliveryStatus === "failed") {
    setError(
      `Email delivery failed. You can copy the invite link instead.`
    );
    setSuccessMessage(null);
  } else {
    setSuccessMessage(`Invitation sent to ${invitation.invitedEmailNormalized}.`);
  }
},
```

**jj commit**: "fix: surface email delivery failures in UI"

#### 5.6 Document the `list_collaborators_pk` index caveat

**File**: `drizzle/schema.ts`

Add comment before line 98:

```typescript
// NOTE: This unique index on (listId, userId) allows duplicate NULL userId values
// because PostgreSQL treats each NULL as distinct in unique indexes.
// After userId became nullable (migration 0005), this no longer functions as a
// true composite primary key for invitation rows where userId is NULL.
// The actual uniqueness constraints for invitations are enforced by:
// - list_collaborators_accepted_membership_unique (for accepted members)
// - list_collaborators_open_invite_email_unique (for open invitations)
```

**jj commit**: "docs: document list_collaborators_pk index NULL behavior"

#### 5.7 Address "duplicate" permission helpers (Issue #17)

**File**: `app/lists/_actions/permissions.ts`

Issue #17 flagged `isListOwner` as duplicating `isAuthorizedToChangeVisibility` and `canManageInvitations`. This is **intentional** — each function represents a distinct capability that happens to have the same implementation today but may diverge in the future. `canManageInvitations` was already deleted in Phase 1 and replaced with `isAuthorizedToEditCollaborators`. Add a brief code comment at the top of `permissions.ts` explaining the design:

```typescript
// Permission functions represent distinct capabilities, not ownership checks.
// Even when multiple functions share the same implementation today (e.g.,
// isAuthorizedToEditCollaborators and isAuthorizedToChangeVisibility both
// check for "owner" role), they exist as separate functions because the
// allowed roles for each capability may diverge independently.
```

**jj commit**: "docs: document permission function design intent"

#### 5.8 Remove type assertions

**File**: `lib/invitations/service.ts`

Replace `as ListInvitation["id"]` casts (lines 249, 501, 522, 593) with proper type narrowing. Since `InvitationRow.id` is `number` and `ListInvitation["id"]` is `Tagged<number, "ListInvitationId">`, add a conversion helper:

```typescript
function toInvitationId(id: number): ListInvitation["id"] {
  return id as ListInvitation["id"];
}
```

Replace `as InvitationInsert` cast (line 253) by ensuring `commonValues` includes `listId` in the insert path without needing a cast.

**jj commit**: "refactor: replace type assertions with explicit conversion functions"

#### 5.9 Fix N+1 queries on collaborator management page

**File**: `app/lists/_actions/collaborators.ts`

Add a batch function:

```typescript
export async function getCollaboratorsForLists(
  listIds: List["id"][]
): Promise<Map<number, ListUser[]>> {
  if (listIds.length === 0) return new Map();
  const db = drizzle(sql);
  const rows = await db
    .select({
      id: UsersTable.id,
      name: UsersTable.name,
      email: UsersTable.email,
      role: ListCollaboratorsTable.role,
      listId: ListCollaboratorsTable.listId,
    })
    .from(ListCollaboratorsTable)
    .innerJoin(UsersTable, eq(ListCollaboratorsTable.userId, UsersTable.id))
    .where(
      and(
        inArray(ListCollaboratorsTable.listId, listIds),
        eq(ListCollaboratorsTable.inviteStatus, INVITATION_STATUS.ACCEPTED)
      )
    );

  const result = new Map<number, ListUser[]>();
  for (const row of rows) {
    const list = result.get(row.listId) ?? [];
    list.push(createTaggedListUser(row));
    result.set(row.listId, list);
  }
  return result;
}
```

**File**: `lib/invitations/service.ts`

Add a batch function:

```typescript
export async function listInvitationsForLists(
  params: {
    listIds: List["id"][];
    statuses?: InvitationStatus[];
  },
  repo?: InvitationRepository
): Promise<Map<number, ListInvitation[]>> {
  // ... batch query using inArray on listId
}
```

This requires adding a `listInvitationsByListIds` method to the repository interface.

**File**: `app/lists/collaborators/page.tsx`

Replace the per-list Promise.all loop with batch queries:

```typescript
const listIds = ownerLists.map((list) => list.id);
const [collaboratorsMap, invitationsMap] = await Promise.all([
  getCollaboratorsForLists(listIds),
  listInvitationsForLists({ listIds }),
]);

const listData = ownerLists.map((list) => ({
  list,
  collaborators: collaboratorsMap.get(list.id as number) ?? [],
  invitations: invitationsMap.get(list.id as number) ?? [],
}));
```

This reduces from 1 + 3N queries to 3 queries total.

**jj commit**: "perf: batch collaborator and invitation queries to fix N+1"

### Success Criteria:

#### Automated Verification:
- [x] `npm run typecheck` passes
- [x] `npm run lint` passes
- [x] `npm run test:unit` passes
- [x] `npm run test:integration` passes
- [x] `npm run build` succeeds

---

## Testing Strategy

### Unit Tests (`tests/unit/`):
- `permissions.test.ts` — consolidated permission functions
- `validation.test.ts` — redirect sanitization, email validation
- `rate-limit.test.ts` — rate limiter behavior
- `invitations/token.test.ts` — existing (unchanged)

### Integration Tests (`tests/integration/`):
- `invitations/service.test.ts` — extended with status guard and accepted-membership tests
- `invitations/webhook.test.ts` — extended with Svix verification tests
- `invitations/owner-ui-actions.test.ts` — updated import (canManageInvitations → isAuthorizedToEditCollaborators)
- `invitations/acceptance.test.ts` — existing (unchanged)
- `invitations/lifecycle-hooks.test.ts` — existing (unchanged)

### E2E Tests (`tests/e2e/`):
- Existing tests should continue passing
- No new e2e tests planned (manual verification covers the UI changes)

### Test Patterns:
- Use existing `InMemoryInvitationRepository` for service-layer tests
- Use `buildListUser`/`buildInvitation` helpers from `owner-ui-actions.test.ts`
- All tests use Vitest `describe`/`it`/`expect` pattern

## Performance Considerations

- **Batch queries** (Phase 5.9): Reduces collaborator page from 1+3N to 3 queries
- **emailDeliveryProviderId index** (Phase 3.4): Eliminates full table scan on webhook receipt
- **Rate limiting** (Phase 4.5): In-memory Map; will not survive server restarts. Acceptable for basic protection but not production-grade. Document as a known limitation.

## Migration Notes

- **Migration 0007**: Adds index only — safe to apply, no data changes, no downtime
- **Resend SDK upgrade**: v4→v6, `emails.send()` API is stable. Only change is addition of `webhooks.verify()`
- **Breaking client changes**: `ownerUserId` prop removal requires updating all parent components in the same commit to avoid type errors

## Manual QA Checklist

After all 5 phases are complete and all automated checks pass (`npm run verify:all && npm run build`), perform the following manual verification:

### Phase 1: Authorization
- [ ] Creating a list works (create-list form no longer sends creatorId)
- [ ] Managing collaborators works (invite, resend, revoke, approve, reject)
- [ ] Accepting an invitation via `/invite?token=...` works
- [ ] Editing a todo as a collaborator works
- [ ] Editing a todo as a non-collaborator fails with error
- [ ] Archiving/unarchiving/deleting a list works for the owner
- [ ] Non-owners cannot archive/delete lists they don't own

### Phase 2: Webhook Verification
- [ ] With `RESEND_WEBHOOK_SECRET` unset, POST to `/api/webhooks/resend` returns 503
- [ ] With secret set, POST without Svix headers returns 401

### Phase 3: Data Integrity
- [ ] Creating an invitation for an email that's already an accepted collaborator shows an error
- [ ] Resending a revoked invitation shows an error
- [ ] Migration 0007 applied cleanly (index exists on `emailDeliveryProviderId`)

### Phase 4: Input Validation & Security
- [ ] Navigating to `/sign-in?redirectTo=//evil.com` redirects to `/` not `//evil.com`
- [ ] Inviting an invalid email (e.g., "notanemail") shows a validation error
- [ ] Rapidly sending 11+ invitations in under a minute shows rate limit error
- [ ] Invite page shows "Account error" if session has no email (edge case)

### Phase 5: Code Quality
- [ ] Collaborator management page loads correctly (N+1 fix didn't break rendering)
- [ ] Copy Link button works, and shows fallback message if clipboard fails
- [ ] Creating invitation where email delivery fails shows error in UI instead of success toast

## References

- Research: `thoughts/shared/research/2026-02-08-pr8-fix-strategy.md`
- PR review: `thoughts/shared/research/2026-02-08-pr8-review-comments-summary.md`
- Resend webhook docs: https://resend.com/docs/webhooks/verify-webhooks-requests
- Existing upsert pattern: `drizzle/ownerCollaborator.ts:31-39`
- In-memory test repo: `tests/integration/invitations/in-memory-repo.ts`
