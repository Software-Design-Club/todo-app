---
technical-spec: true
status: final
---

# Unify Invite Flow — Technical Spec

**Stage:** 7 — Technical Design + Code Contracts
**Date:** 2026-03-13
**Status:** Final

---

## Source Traceability

| Artifact | Path |
|----------|------|
| Frame | `plan/unify-invite-flow/stage-1-frame.md` |
| Shape | `plan/unify-invite-flow/stage-2-shape.md` |
| Breadboard | `plan/unify-invite-flow/stage-3-breadboard.md` |
| Draft Spec | `plan/unify-invite-flow/stage-4-draft-spec.md` |
| Slices | `plan/unify-invite-flow/stage-5-slices.md` |
| Final Functional Spec | `plan/unify-invite-flow/stage-6-final-spec.md` |

---

## Architecture Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| AD1 | Permission check (`assertCanManageCollaborators`) runs **before** the try-catch in `inviteCollaborator`. Permission errors throw and are not folded into `InviteCollaboratorResult`. | The `ManageCollaborators` panel is gated to owners; an unauthorized direct call is a security violation, not a recoverable operational failure. |
| AD2 | `InviteCollaboratorResult` and `InviteCollaboratorWorkflowResult` live in `lib/types.ts` and `lib/invitations/service.ts` respectively — same layers as related types. | No new modules or layers. `InviteCollaboratorResult` is a client-facing contract; the workflow result type belongs with the service. |
| AD3 | `searchInvitableUsers` lives in `app/lists/_actions/collaborators.ts` alongside `searchUsers`. | It replaces `searchUsers` at the same call boundary; no new file needed. |
| AD4 | `addCollaborator` is deleted from `collaborators.ts`. No deprecation wrapper. | It has exactly one call site (which is being replaced in this feature). Wrappers would be YAGNI. |
| AD5 | Email normalization (`trim().toLowerCase()`) applied inside `findOrCreateAccount` before the INSERT. `getUser` lookup is not changed (auth provider normalizes before calling it). | Normalization at write time is the correct boundary. Existing rows are untouched. |
| AD6 | `InviteByEmailForm` gains an optional `onSuccess` prop. `router.refresh()` moves inside an `else` branch so it only fires when `onSuccess` is absent. The existing `finally` block is removed as the call site. | Keeps both surfaces working without duplication. The collaborators page (no `onSuccess` prop) stays unchanged in behavior. |

---

## Data Type Definitions

### New type: `InviteCollaboratorResult` — `lib/types.ts`

```typescript
export type InviteCollaboratorResult =
  | { kind: "success"; invitation: SentInvitationSummary }
  | { kind: "failure"; errorMessage: string };
```

**Invariants:**
- `kind` is a literal discriminant — exhaustive switch/if-checks on it are safe.
- `invitation` in the success variant is a fully-typed `SentInvitationSummary` (not the union `InvitationSummary`).
- `errorMessage` in the failure variant is always a non-empty string constructed server-side.

---

### Modified type: `InviteCollaboratorWorkflowResult` — `lib/invitations/service.ts`

Current:
```typescript
type InviteCollaboratorWorkflowResult = {
  invitationId: InvitationId;
  acceptanceUrl: AbsoluteInvitationUrl;
  emailServiceResponse: EmailServiceSendResponse;
};
```

After change (add `expiresAt`):
```typescript
type InviteCollaboratorWorkflowResult = {
  invitationId: InvitationId;
  acceptanceUrl: AbsoluteInvitationUrl;
  emailServiceResponse: EmailServiceSendResponse;
  expiresAt: InvitationExpiry;          // threaded from issueInvitation → PersistedSentInvitation
};
```

**Invariants:**
- `expiresAt` is already available on `persistedInvitation.expiresAt` (type `InvitationExpiry`, tagged) — no additional DB read required.
- No other callers of `inviteCollaboratorWorkflow` read `expiresAt` today; the change is additive and non-breaking.

---

## Function Contracts

### 1. `findOrCreateAccount` — `app/sign-in/_components/_actions/find-or-create-account.ts`

**Signature (unchanged):**
```typescript
async function findOrCreateAccount(
  credentials: { email: string; name?: string | null }
): Promise<void>
```

**Change:** Before the INSERT, normalize `credentials.email`:
```typescript
const normalizedEmail = credentials.email.trim().toLowerCase();
// use normalizedEmail in place of credentials.email for the INSERT value
// the WHERE eq(UsersTable.email, credentials.email) lookup is unchanged
```

**Preconditions:**
- `credentials.email` is a non-empty string (provided by the auth provider).

**Postconditions:**
- If a new row is inserted into `UsersTable`, `email` is `credentials.email.trim().toLowerCase()`.
- Existing rows in `UsersTable` are not modified.
- The lookup `WHERE email = credentials.email` (before normalization) is intentionally unchanged — the auth provider normalizes before passing to this function in production.

**Effects:**
- Writes: `UsersTable` (INSERT when account is new)
- Writes: `ListsTable` (via `createList`), `TodosTable` (when account is new)
- Does not read from or write to `InvitationsTable`

**Errors:** None added.

---

### 2. `searchInvitableUsers` — `app/lists/_actions/collaborators.ts`

**Signature (new):**
```typescript
export async function searchInvitableUsers(
  searchTerm: string,
  listId: List["id"]
): Promise<User[]>
```

**Preconditions:**
- `searchTerm` is a non-empty string (caller enforces; action returns `[]` on empty).
- `listId` identifies an existing list (no assertion made; empty result is acceptable if list does not exist).

**Postconditions:**
- Returns at most 10 `User` records whose `name` or `email` matches `searchTerm` (case-insensitive `ilike`), excluding:
  1. Users who have a row in `list_collaborators` for `listId` (any role — owner or collaborator).
  2. Users whose `UsersTable.email` matches `invitations.invitedEmailNormalized` for an open invitation (`status IN ('sent', 'pending')`) on `listId`.
- Both exclusions are applied in a **single DB query** via subquery expressions — no client-side filtering.
- Returns `[]` on any DB error (swallowed with `console.error`).

**Effects:**
- Reads: `UsersTable`, `ListCollaboratorsTable`, `InvitationsTable`
- No writes

**Query structure:**
```typescript
db.select({ id, name, email })
  .from(UsersTable)
  .where(
    and(
      or(
        ilike(UsersTable.name, `%${searchTerm}%`),
        ilike(UsersTable.email, `%${searchTerm}%`)
      ),
      notInArray(
        UsersTable.id,
        db.select({ id: ListCollaboratorsTable.userId })
          .from(ListCollaboratorsTable)
          .where(eq(ListCollaboratorsTable.listId, listId))
      ),
      notInArray(
        UsersTable.email,
        db.select({ email: InvitationsTable.invitedEmailNormalized })
          .from(InvitationsTable)
          .where(
            and(
              eq(InvitationsTable.listId, listId),
              inArray(InvitationsTable.status, ["sent", "pending"])
            )
          )
      )
    )
  )
  .limit(10)
```

**Errors:** None thrown; returns `[]` on error.

---

### 3. `inviteCollaboratorWorkflow` — `lib/invitations/service.ts`

**Signature (unchanged):**
```typescript
export async function inviteCollaboratorWorkflow(input: {
  listId: List["id"];
  inviterId: User["id"];
  invitedEmail: EmailAddress;
  now: Date;
}): Promise<InviteCollaboratorWorkflowResult>
```

**Change:** Thread `expiresAt` from `persistedInvitation` into the return value.

```typescript
return {
  invitationId: persistedInvitation.invitationId,
  acceptanceUrl,
  emailServiceResponse,
  expiresAt: persistedInvitation.expiresAt,   // add this line
};
```

**Preconditions / Postconditions / Effects:** Unchanged. `expiresAt` is already computed by `issueInvitation`; this is a read-through addition only.

**Errors (unchanged):**
- Throws `InvitationPermissionDeniedError` if `inviterId` is not an owner of `listId`.
- Throws `ListNotFoundError` if `listId` does not exist.

---

### 4. `inviteCollaborator` server action — `app/lists/_actions/invitations.ts`

**Signature (return type changes):**
```typescript
export async function inviteCollaborator(input: {
  listId: List["id"];
  inviterId?: User["id"];
  invitedEmail: EmailAddress;
  now?: Date;
}): Promise<InviteCollaboratorResult>
```

**Implementation structure:**
```typescript
export async function inviteCollaborator(input: { ... }): Promise<InviteCollaboratorResult> {
  const inviterId = await requireInvitationActionActorId(input.inviterId);

  // Permission check throws — not folded (AD1)
  await assertCanManageCollaborators({ listId: input.listId, actorId: inviterId });

  try {
    const result = await inviteCollaboratorWorkflow({
      listId: input.listId,
      inviterId,
      invitedEmail: input.invitedEmail,
      now: input.now ?? new Date(),
    });

    if (result.emailServiceResponse.kind === "rejected") {
      return {
        kind: "failure",
        errorMessage: `Invitation saved but email delivery failed: ${result.emailServiceResponse.errorMessage}`,
      };
    }

    const invitedEmailNormalized =
      input.invitedEmail.trim().toLowerCase() as NormalizedEmailAddress;

    return {
      kind: "success",
      invitation: {
        kind: "sent",
        invitationId: result.invitationId,
        listId: input.listId as ListId,
        invitedEmailNormalized,
        expiresAt: result.expiresAt,
      },
    };
  } catch (error) {
    return {
      kind: "failure",
      errorMessage:
        error instanceof Error ? error.message : "Failed to send invitation.",
    };
  }
}
```

**Preconditions:**
- `input.invitedEmail` is a non-empty `EmailAddress`-tagged string.
- Caller has a valid session (or test bypass is active).

**Postconditions:**
- Returns `{ kind: "success"; invitation: SentInvitationSummary }` when: session resolves, permission passes, workflow runs, and email is accepted.
- Returns `{ kind: "failure"; errorMessage }` when email delivery is rejected by the provider.
- Returns `{ kind: "failure"; errorMessage }` when the workflow throws any non-permission error.
- Throws `CollaboratorManagementPermissionDeniedError` when `inviterId` is not an owner of `listId` (not folded).
- Throws `"Authentication required"` when no session and no test bypass (from `requireInvitationActionActorId`).

**Effects:**
- Reads: `ListCollaboratorsTable` (permission check), `ListsTable` (via workflow)
- Writes: `InvitationsTable` (INSERT or UPDATE via `issueInvitation`)
- External: calls email provider via `sendInvitationEmail`
- No writes to `ListCollaboratorsTable`

**Removed:** The action no longer returns `InviteCollaboratorWorkflowResult` directly. No caller inspects `emailServiceResponse`.

---

### 5. `InviteByEmailForm` — `app/lists/_components/invite-by-email-form.tsx`

**Props (changed):**
```typescript
type InviteByEmailFormProps = {
  listId: List["id"];
  onSuccess?: (invitation: SentInvitationSummary) => void;
};
```

**Behavior change:**
- Check `result.kind !== "success"` for the failure path (replaces `result.emailServiceResponse.kind !== "accepted"`).
- Call `onSuccess(result.invitation)` when `result.kind === "success"` and `onSuccess` is provided.
- Call `router.refresh()` only when `result.kind === "success"` and `onSuccess` is **absent** (i.e., `else { router.refresh() }`).
- Remove the `finally { router.refresh() }` block.

**Preconditions:**
- `listId` is a valid `List["id"]` for a list the current user owns.

**Postconditions:**
- On success + `onSuccess` present: calls `onSuccess(invitation)`; does not call `router.refresh()`.
- On success + `onSuccess` absent: calls `router.refresh()`; does not call `onSuccess`.
- On failure: shows `toast.error`; does not call `onSuccess` or `router.refresh()`.

**Effects:**
- Calls `inviteCollaborator` server action.
- Conditionally calls `router.refresh()`.
- Conditionally calls `onSuccess` callback.

---

### 6. `ManageCollaborators` — `app/lists/_components/manage-collaborators.tsx`

**Props (unchanged):**
```typescript
type ManageCollaboratorsProps = {
  listId: List["id"];
  initialCollaborators: ListUser[];
  initialInvitations: InvitationSummary[];
};
```

**State addition:**
```typescript
const [invitations, setInvitations] = useState<InvitationSummary[]>(initialInvitations);
```

**Search action replacement:**
- Replace `searchUsers(searchTerm)` call with `searchInvitableUsers(searchTerm, listId)`.
- Call site and result shape (`User[]`) are identical; no further changes to search display logic.

**Mutation replacement (search-select path):**
- Remove `addCollaboratorMutation` (called `addCollaborator`).
- Add a new `inviteSelectedUserMutation` (or inline transition) calling `inviteCollaborator({ listId, invitedEmail: selectedUserToAdd.email as EmailAddress })`.
- On `result.kind === "failure"`: show `toast.error(result.errorMessage)`; **do not** clear panel state.
- On `result.kind === "success"`:
  1. Append `result.invitation` to `invitations` via `setInvitations`.
  2. Clear search input, results, and `selectedUserToAdd`.
  3. Do not close the dropdown.

**Confirmation button label:** `"Invite {selectedUserToAdd.name}"` (replaces `"Add {name}"`).

**`InviteByEmailForm` wiring:**
```typescript
<InviteByEmailForm
  listId={listId}
  onSuccess={(invitation) => setInvitations((prev) => [...prev, invitation])}
/>
```

**Pending invitations render:**
```typescript
<PendingInvitationsList invitations={invitations} />
```
(reads from local state, not `initialInvitations` directly)

**Removed:** All references to `addCollaborator` import and `addCollaboratorMutation`.

**Effects:**
- No `useEffect` to sync `initialInvitations` into state — initialized once at mount.
- No `router.refresh()` inside the dropdown after a successful invite.

---

## Deletion Map

| Symbol | File | Removal scope |
|--------|------|--------------|
| `addCollaborator` | `app/lists/_actions/collaborators.ts` | Delete entire function |
| `addCollaboratorMutation` | `app/lists/_components/manage-collaborators.tsx` | Delete useMutation hook and all call sites |
| `searchUsers` import in `manage-collaborators.tsx` | `app/lists/_components/manage-collaborators.tsx` | Remove import; replace call with `searchInvitableUsers` |

`searchUsers` itself stays in `collaborators.ts` — it may be used elsewhere. Only its import in `manage-collaborators.tsx` is removed.

---

## Slice-to-Contract Map

| Slice | Contracts touched |
|-------|------------------|
| A | `findOrCreateAccount` — email normalization before INSERT |
| B | `searchInvitableUsers` — new function |
| C | `InviteCollaboratorResult` (new type), `InviteCollaboratorWorkflowResult` (add `expiresAt`), `inviteCollaboratorWorkflow` (thread `expiresAt`), `inviteCollaborator` (new return type + permission + error folding), delete `addCollaborator`, update `ManageCollaborators` mutation + button label |
| D | `InviteByEmailForm` (add `onSuccess` prop), `ManageCollaborators` (add `invitations` state, wire `onSuccess`, wire `PendingInvitationsList`) |

---

## Open Questions Resolved

| OQ | Resolution |
|----|-----------|
| Permission error handling | Option P1: `assertCanManageCollaborators` runs before try-catch; throws `CollaboratorManagementPermissionDeniedError`; not folded into `InviteCollaboratorResult`. Human confirmed 2026-03-13. |
