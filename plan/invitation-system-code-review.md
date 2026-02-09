# Code Review: Invitation System Implementation

**Date**: 2026-02-11
**Branch**: Current HEAD vs `main`
**Scope**: ~5,095 lines added across 40 files

---

## Critical Issues (Fix Immediately) 🚨

### 1. Syntax Errors in `app/lists/_actions/collaborators.ts`

This file has severe merge conflict artifacts and syntax errors that will prevent compilation:

**Issues:**

1. **Duplicate imports** (lines 4-6, 7-20):
   ```typescript
   import { and, eq, ilike, inArray, or } from "drizzle-orm";
   // ... later ...
   import { eq, or, ilike, and } from "drizzle-orm";  // Duplicate!
   ```

2. **Syntax error in `and()` clause** (lines 76-82):
   ```typescript
   .where(
     and(
       eq(ListCollaboratorsTable.userId, user.id),
       eq(ListCollaboratorsTable.listId, listId)     // Missing comma!
       eq(ListCollaboratorsTable.listId, listId),    // Duplicate line
       eq(ListCollaboratorsTable.inviteStatus, INVITATION_STATUS.ACCEPTED)
     )
   )
   ```

3. **Duplicate object key** (lines 107-108):
   ```typescript
   return createTaggedListUser({
     id: result[0].userId,      // 'result' is undefined!
     id: inserted.userId,        // Duplicate key!
     // ...
   });
   ```

4. **Malformed error handling** (lines 114-135): Two `if` blocks with improper nesting and missing closing braces.

5. **Dead code after return** (lines 164-174): The `getCollaborators` function has orphaned code after the `return []` statement.

6. **Duplicate `listId` in values** (lines 93-95):
   ```typescript
   .values({
     userId: user.id,
     listId: listId,
     listId,                     // Duplicate!
     // ...
   })
   ```

7. **Same duplicate `and()` issue** (lines 232-238) in `removeCollaborator`.

**Action**: Fix all syntax errors before proceeding with any other changes. Run `npm run typecheck` and `npm run lint` to verify.

---

## Security Vulnerabilities

### Critical Issues

#### 2. Missing Webhook Replay Attack Protection (app/api/webhooks/resend/route.ts:14-75)

```typescript
export async function POST(request: NextRequest) {
  const svixTimestamp = request.headers.get("svix-timestamp");
  // Missing: timestamp validation against replay attacks

  payload = verifyWebhookPayload({...}); // Only verifies signature
}
```

**Fix**: Add timestamp validation:

```typescript
const timestamp = parseInt(svixTimestamp);
const WEBHOOK_TOLERANCE_MS = 300000; // 5 minutes

if (Date.now() - timestamp > WEBHOOK_TOLERANCE_MS) {
  return NextResponse.json(
    { error: "Webhook timestamp too old" },
    { status: 401 }
  );
}
```

#### 3. Rate Limiting Bypass via Memory Store (lib/rate-limit.ts:1-31)

```typescript
const windows = new Map<string, { count: number; resetAt: number }>();
```

This in-memory store resets on server restart and doesn't work across distributed instances.

**Fix**: Use Redis or a persistent store:

```typescript
import { kv } from '@vercel/kv';

export async function checkRateLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const now = Date.now();
  const entry = await kv.get<{ count: number; resetAt: number }>(params.key);

  if (!entry || now >= entry.resetAt) {
    await kv.set(params.key, { count: 1, resetAt: now + params.windowMs });
    await kv.expire(params.key, Math.ceil(params.windowMs / 1000));
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= params.limit) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  await kv.set(params.key, { ...entry, count: entry.count + 1 });
  return { allowed: true, retryAfterMs: 0 };
}
```

#### 4. Weak Email Validation (lib/validation.ts:11-28)

```typescript
export function isValidEmail(email: string): boolean {
  const atIndex = trimmed.indexOf("@");
  if (atIndex < 1 || atIndex === trimmed.length - 1) {
    return false;
  }
  // Missing validation for:
  // - Multiple @ symbols
  // - Invalid characters
  // - Internationalized domains
}
```

**Fix**: Use a proper email validation regex:

```typescript
export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) {
    return false;
  }

  // RFC 5322 simplified regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed);
}
```

#### 5. Open Redirect Vulnerability (lib/validation.ts:1-10)

```typescript
export function sanitizeRedirectTarget(redirectTo?: string): string {
  if (!redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
    return "/";
  }
  return redirectTo;
}
```

This blocks `//example.com` but allows `/\example.com` on some browsers.

**Fix**:

```typescript
export function sanitizeRedirectTarget(redirectTo?: string): string {
  if (!redirectTo) return "/";

  try {
    const url = new URL(redirectTo, 'http://localhost');
    if (url.protocol !== 'http:' || url.hostname !== 'localhost') {
      return "/";
    }
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
```

### Medium Severity Issues

#### 6. Token Storage Security (lib/invitations/token.ts)

Ensure invitation tokens are:
- Cryptographically random (minimum 32 bytes)
- Hashed with a secure algorithm (bcrypt, scrypt, or Argon2)
- Never logged or exposed in error messages

#### 7. Missing CSRF Protection on State-Changing Actions

All mutation actions in `app/lists/_actions/invitations.ts` should verify CSRF tokens. Next.js Server Actions provide this by default, but ensure it's not disabled.

---

## Bugs & Edge Cases

### 8. Race Condition in Token Consumption (lib/invitations/service.ts:889-965)

```typescript
export async function consumeInvitationToken(params, repo?) {
  const invite = await invitationRepo.findByTokenHash(tokenHash);
  // Gap here: another request could consume the same token

  if (invite.inviteStatus === INVITATION_STATUS.ACCEPTED) {
    return { status: "accepted" };
  }

  const updated = await invitationRepo.updateInvitation(invite.id, {
    inviteStatus: status,
    inviteTokenHash: null,  // Token cleared, but race already occurred
  });
}
```

**Fix**: Use optimistic locking or database-level constraints:

```typescript
const updated = await invitationRepo.updateInvitation(
  invite.id,
  {
    inviteStatus: status,
    inviteTokenHash: null,
  },
  {
    where: {
      id: invite.id,
      inviteTokenHash: tokenHash, // Only update if token still matches
      inviteStatus: 'sent'
    }
  }
);

if (!updated) {
  return { status: "invalid" };
}
```

### 9. Missing Transaction Boundaries (app/lists/_actions/invitations.ts:62-111)

```typescript
export async function createInvitationForList(params) {
  const { invitation, inviteToken } = await createOrRotateInvitation({...});

  // If email sending fails here, invitation exists but email never sent
  const emailDelivery = await sendInvitationEmail({...});

  await updateInvitationEmailDeliveryStatus({...}); // Could fail
}
```

**Fix**: Wrap in a transaction or implement retry logic:

```typescript
export async function createInvitationForList(params) {
  const db = drizzle(sql);

  return await db.transaction(async (tx) => {
    const { invitation, inviteToken } = await createOrRotateInvitation(
      params,
      new DrizzleInvitationRepository(tx)
    );

    try {
      const emailDelivery = await sendInvitationEmail({...});
      await updateInvitationEmailDeliveryStatus({...});
      return { invitation, inviteLink: buildInvitationAcceptUrl(inviteToken) };
    } catch (error) {
      // Email failure doesn't rollback invitation - intentional for manual retry
      throw error;
    }
  });
}
```

### 10. Expiry Check Race Condition (lib/invitations/service.ts:919-927)

```typescript
if (isInvitationExpired(invite.inviteExpiresAt, now)) {
  await invitationRepo.updateInvitation(invite.id, {
    inviteStatus: INVITATION_STATUS.EXPIRED,
    inviteTokenHash: null,
    inviteExpiredAt: now,
  });
  return { status: "expired" };
}
```

Multiple concurrent requests could all see "not expired" and proceed simultaneously.

**Fix**: Move expiry to a database constraint or use row-level locking.

### 11. Missing Null Checks (app/lists/_components/manage-collaborators.tsx:112-145)

```typescript
const createInvitationMutation = useMutation({
  onSuccess: ({ invitation }) => {
    // What if invitation is undefined due to server error?
    setCurrentInvitations((previousInvitations) => {
      const inviteIndex = previousInvitations.findIndex(
        (existingInvite) => existingInvite.id === invitation.id
      );
    });
  },
});
```

**Fix**: Add defensive checks:

```typescript
onSuccess: (data) => {
  if (!data?.invitation) {
    setError("Invitation created but response was invalid");
    return;
  }
  const { invitation } = data;
  // ... rest of logic
},
```

### 12. Incomplete Error Handling (app/api/webhooks/resend/route.ts:42-52)

```typescript
try {
  payload = verifyWebhookPayload({...});
} catch {
  return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
}
```

Swallowing all errors makes debugging impossible.

**Fix**:

```typescript
try {
  payload = verifyWebhookPayload({...});
} catch (error) {
  console.error('Webhook verification failed:', error);
  return NextResponse.json(
    { error: "Invalid signature." },
    { status: 401 }
  );
}
```

---

## Architecture & Design

### Strengths

1. **Clean separation of concerns**: The repository pattern (`InvitationRepository`) provides excellent abstraction between data access and business logic
2. **Tagged types**: Using branded types (`InviteToken`, `InvitedEmailNormalized`) provides compile-time safety and prevents primitive obsession
3. **Comprehensive state machine**: The invitation status flow (`sent` -> `accepted`/`pending_approval`/`revoked`/`expired`) is well-designed
4. **Good test coverage**: Integration tests cover key scenarios including concurrency

### Concerns

#### 13. Database Schema Design Issue (drizzle/schema.ts:77-113)

The partial unique index approach creates complexity:

```typescript
// Current approach has overlapping concerns
uniqueIndex("list_collaborators_pk").on(listId, userId),
uniqueIndex("list_collaborators_accepted_membership_unique")
  .on(listId, userId)
  .where(sql`inviteStatus = 'accepted' AND userId IS NOT NULL`),
uniqueIndex("list_collaborators_open_invite_email_unique")
  .on(listId, invitedEmailNormalized)
  .where(sql`inviteStatus IN ('sent', 'pending_approval')...`)
```

**Recommendation**: Consider separating concerns with a dedicated `list_invitations` table:

```sql
-- Better separation: accepted collaborators vs pending invitations
CREATE TABLE list_collaborators (
  id SERIAL PRIMARY KEY,
  list_id INTEGER NOT NULL REFERENCES lists(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  role collaborator_role NOT NULL,
  UNIQUE(list_id, user_id)
);

CREATE TABLE list_invitations (
  id SERIAL PRIMARY KEY,
  list_id INTEGER NOT NULL REFERENCES lists(id),
  invited_email TEXT NOT NULL,
  status invitation_status NOT NULL,
  -- all invitation-specific fields here
  UNIQUE(list_id, invited_email) WHERE status IN ('sent', 'pending_approval')
);
```

This separates the domain concerns and eliminates nullable `userId` on accepted rows.

---

## Readability & Maintainability

### 14. God Service (lib/invitations/service.ts - 750 lines)

This single file handles repository implementation, business logic, email normalization, and multiple mutation operations.

**Fix**: Split into focused modules:

```
lib/invitations/
  ├── repository/
  │   ├── interface.ts
  │   ├── drizzle-repository.ts
  │   └── in-memory-repository.ts  (for tests)
  ├── domain/
  │   ├── email.ts  (normalization)
  │   ├── token.ts
  │   └── validation.ts
  ├── operations/
  │   ├── create-invitation.ts
  │   ├── consume-invitation.ts
  │   ├── revoke-invitation.ts
  │   └── approve-invitation.ts
  └── index.ts  (public API)
```

### 15. Inconsistent Naming (lib/invitations/service.ts)

```typescript
type InvitationEmail = ...           // Should be NormalizedEmail
type InvitationTokenHash = ...       // Should be TokenHash
type InvitationEmailDeliveryProviderId = ... // Should be EmailProviderId
```

### 16. Magic Numbers

Extract expiry durations, rate limits, and other magic numbers to `lib/invitations/constants.ts`.

### 17. Missing JSDoc for Complex Functions (lib/invitations/service.ts:453-493)

`upsertOpenInvitation` needs documentation explaining the conflict resolution strategy.

---

## Best Practices & Standards

### 18. Direct Database Access in Server Actions (app/lists/_actions/invitations.ts:51-61)

```typescript
async function getInviterName(inviterId: User["id"]): Promise<string> {
  const db = drizzle(sql);  // Creating DB connection in action layer
  const [user] = await db.select({...}).from(UsersTable)...
}
```

**Fix**: Extract to a proper repository or service layer.

### 19. Hardcoded Error Messages (throughout)

Centralize error messages:

```typescript
// lib/errors/invitation-errors.ts
export const InvitationErrors = {
  OWNER_ONLY: "Only the list owner can manage invitations.",
  RATE_LIMIT: "Too many invitations. Please wait before trying again.",
  INVALID_EMAIL: "Please enter a valid email address.",
} as const;
```

### 20. Missing Input Sanitization (app/invite/page.tsx:14-63)

Token from `searchParams` is passed directly to the service without format validation.

**Fix**: Validate token format (alphanumeric, max length) before processing.

### 21. Hardcoded SQL in `lib/invitations/service.ts` (lines 197-209)

The `upsertOpenInvitation` method uses `onConflictDoUpdate` but the `targetWhere` uses raw SQL that duplicates the partial index logic:

```typescript
targetWhere: sql`${ListCollaboratorsTable.inviteStatus} IN ('sent', 'pending_approval') AND ${ListCollaboratorsTable.invitedEmailNormalized} IS NOT NULL`,
```

If the database partial index definition changes, this raw SQL string won't be updated by TypeScript/refactoring tools. Consider referencing constants.

### 22. Function Ordering in `app/lists/_actions/invitations.ts` (line 38)

```typescript
if (!isOwnerAuthorizedForInvitationActions(collaborators, user.id)) {
```

This function is defined on lines 44-49 **after** it's called. While it works due to module scope, it's odd ordering. Consider moving function definition before its first use.

### 23. Error Message Quality in `app/api/webhooks/resend/route.ts` (lines 59-60)

```typescript
const errorMessage =
  ("reason" in data ? (data.reason as string) : undefined) ?? payload.type;
```

This relies on `payload.type` as a fallback error message, which will be values like `"email.failed"` or `"email.bounced"`. These are technical identifiers, not user-friendly messages. Consider mapping to human-readable descriptions.

---

## Refactoring Opportunities

### 24. Reduce Mutation Duplication in UI (app/lists/_components/manage-collaborators.tsx:108-258)

Each of the 5+ mutations has nearly identical error/success handling. Extract a shared hook:

```typescript
function useInvitationMutation<TParams, TResult>(
  mutationFn: (params: TParams) => Promise<TResult>,
  options: {
    onSuccess: (result: TResult) => { message: string; callback?: () => void };
    onError?: (error: Error) => string;
  }
) {
  return useMutation({
    mutationFn,
    onSuccess: (result) => {
      const { message, callback } = options.onSuccess(result);
      setError(null);
      setSuccessMessage(message);
      callback?.();
    },
    onError: (error: Error) => {
      setSuccessMessage(null);
      const msg = options.onError?.(error) ?? error.message ?? "Operation failed";
      setError(msg);
    },
  });
}
```

### 25. Replace Magic Strings with Grouped Constants

```typescript
// lib/invitations/constants.ts
export const InvitationStatusGroups = {
  OPEN: ['sent', 'pending_approval'] as const,
  CLOSED: ['accepted', 'revoked', 'expired'] as const,
} as const;
```

---

## Summary & Priority

### Critical (Fix Immediately)
- [ ] **#1**: Fix syntax errors in `collaborators.ts`
- [ ] **#2**: Add webhook replay attack protection
- [ ] **#3**: Implement persistent rate limiting
- [ ] **#8**: Fix race condition in token consumption
- [ ] **#9**: Add transaction boundaries for email sending

### High Priority
- [ ] **#4**: Strengthen email validation
- [ ] **#5**: Fix open redirect vulnerability
- [ ] **#12**: Add proper error logging (don't swallow errors)
- [ ] **#11**: Add null checks in mutation handlers
- [ ] **#10**: Fix expiry check race condition

### Medium Priority
- [ ] **#14**: Split service.ts into focused modules
- [ ] **#18**: Extract repository layer properly
- [ ] **#19**: Centralize error messages
- [ ] **#17**: Add JSDoc to public APIs
- [ ] **#6**: Review token storage security
- [ ] **#7**: Verify CSRF protection is enabled

### Low Priority (Nice to Have)
- [ ] **#16**: Extract magic numbers to constants
- [ ] **#15**: Standardize type naming
- [ ] **#24**: Reduce UI mutation duplication
- [ ] **#13**: Consider table separation for invitations vs collaborators
- [ ] **#20**: Add input sanitization
- [ ] **#21**: Replace hardcoded SQL with constants
- [ ] **#22**: Improve function ordering
- [ ] **#23**: Improve error message quality

---

## Positive Highlights

1. **Excellent test coverage** with integration tests for race conditions
2. **Type safety** with branded types prevents common mistakes
3. **Comprehensive state machine** handles edge cases well
4. **Repository pattern** makes the code testable
5. **Good UX consideration** with separate states for pending approval

---

**Next Steps**: Run `npm run typecheck` and `npm run lint` after fixing critical syntax errors, then address security vulnerabilities before merging.
