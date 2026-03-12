---
technical-design: true
spec: invite-from-list-view-spec.md
slices: invite-from-list-view-slices.md
breadboard: invite-from-list-view-breadboard.md
---

# Invite Collaborators from Individual List View — Technical Design

**Date:** 2026-03-12
**Status:** Approved — ready for implementation

---

## 1. Layer Mapping

This project uses a Next.js App Router codebase. The layers map as follows:

| Layer | Path pattern | Role |
|-------|-------------|------|
| Domain | `lib/types.ts`, `lib/invitations/`, `lib/email/` | Business types, invariants, domain services |
| Application / Adapters | `app/lists/_actions/` | Server actions — Next.js entry points that resolve auth, enforce authorization, and delegate to domain services or query the DB directly |
| UI — Server | `app/lists/_components/list.tsx`, `app/lists/collaborators/page.tsx` | Server components that fetch data and pass it down as props |
| UI — Client | `app/lists/_components/manage-collaborators.tsx`, `app/lists/_components/invite-by-email-form.tsx`, `app/lists/_components/pending-invitations-list.tsx` | Client components that own local interaction state or browser-side effects |

All dependencies point inward. No new violations are introduced.

---

## 2. New and Modified Artifacts

### 2.1 `getInvitations` — new server action

**File:** `app/lists/_actions/invitations.ts` (added to existing file)

**Layer:** Application / Adapters

**Signature:**
```ts
export async function getInvitations(
  listId: List["id"]
): Promise<(SentInvitationSummary | PendingApprovalInvitationSummary)[]>
```

**What it owns:**
- Resolves the authenticated session (via `requireInvitationActionActorId`)
- Enforces collaborator-management permission via `assertCanManageCollaborators` — consistent with every other action in this file; defends against direct calls outside the guarded render path
- Queries `InvitationsTable` WHERE `listId = listId` AND `status IN ('sent', 'pending_approval')`
- Maps DB rows to the `SentInvitationSummary | PendingApprovalInvitationSummary` union type from `lib/types.ts`
- Returns an array (empty if none)

**What it does not own:**
- The permission gate in `list.tsx` (that gate controls whether the fetch is *attempted*; this action enforces authorization independently as a defensive layer)
- UI rendering or error presentation

**Imports:**
- `lib/types.ts` (Domain) — `SentInvitationSummary`, `PendingApprovalInvitationSummary`, `List`
- `drizzle/schema.ts` (Infrastructure) — `InvitationsTable`
- `drizzle-orm/vercel-postgres`, `@vercel/postgres` (Infrastructure)
- `app/lists/_actions/permissions.ts` (Application) — `assertCanManageCollaborators`
- `auth` (Infrastructure) — via `requireInvitationActionActorId`

---

### 2.2 `list.tsx` — conditional fetch

**File:** `app/lists/_components/list.tsx`

**Layer:** UI — Server Component

**What changes:**
- After `editableCollaborators` is derived, add a conditional try/catch block:
  ```ts
  let initialInvitations: (SentInvitationSummary | PendingApprovalInvitationSummary)[] = [];
  if (editableCollaborators) {
    try {
      initialInvitations = await getInvitations(list.id);
    } catch {
      // graceful fallback — section will be absent
    }
  }
  ```
- Pass `initialInvitations` as a new prop to `ManageCollaborators`

**What it does not own:**
- Filtering or transforming the invitations array — that is `getInvitations`'s job
- Rendering invitation rows — that is `PendingInvitationsList`'s job

**New import:**
- `getInvitations` from `app/lists/_actions/invitations`
- `SentInvitationSummary`, `PendingApprovalInvitationSummary` from `lib/types`

---

### 2.3 `ManageCollaborators` — extended props and new sections

**File:** `app/lists/_components/manage-collaborators.tsx`

**Layer:** UI — Client Component

**Prop interface change:**
```ts
interface ManageCollaboratorsProps {
  listId: List["id"];
  initialCollaborators: ListUser[];
  initialInvitations: (SentInvitationSummary | PendingApprovalInvitationSummary)[];
  // editableCollaborators is NOT threaded as a prop — see note below
}
```

**Note on `editableCollaborators`:** The component is already only rendered when `editableCollaborators === true` in `list.tsx` (line 106). All new owner-only content (`PendingInvitationsList`, `InviteByEmailForm`, "Manage all →") is therefore always in owner context when rendered. No additional gate inside the component is needed. This keeps the component boundary clean.

**What changes:**
- Add `initialInvitations` to props
- Render `<PendingInvitationsList invitations={initialInvitations} />` between the Current Collaborators section and the Add New Collaborator section (hidden when `initialInvitations.length === 0` — `PendingInvitationsList` handles this internally)
- Render `<InviteByEmailForm listId={listId} />` below `PendingInvitationsList`
- Render "Manage all →" `<a>` link at the bottom: `href={/lists/collaborators#list-${listId}}`

**Section order (enforced by JSX order):**
1. Current Collaborators (existing)
2. `<PendingInvitationsList>` (absent when empty)
3. Add New Collaborator / user search (existing — renamed or left as "Add New Collaborator")
4. `<InviteByEmailForm>` (new)
5. "Manage all →" link (new)

> **Note on section order vs spec:** The spec (BR-7) orders sections as: Current Collaborators → Pending Invitations → Invite by Email → Manage all →. The existing "Add New Collaborator" user-search section is not mentioned in the spec's new ordering because it is unchanged existing content. It sits between Current Collaborators and the new invitation content. This is consistent with spec intent — the spec only orders the *new* sections relative to each other.

**New imports:**
- `PendingInvitationsList` from `./pending-invitations-list`
- `InviteByEmailForm` from `./invite-by-email-form`
- `SentInvitationSummary`, `PendingApprovalInvitationSummary` from `lib/types`

---

### 2.4 `PendingInvitationsList` — new sub-component

**File:** `app/lists/_components/pending-invitations-list.tsx` *(new file)*

**Layer:** UI — Client Component (stateless display; `"use client"` not strictly required but consistent with directory convention)

**Props:**
```ts
interface PendingInvitationsListProps {
  invitations: (SentInvitationSummary | PendingApprovalInvitationSummary)[];
}
```

**What it owns:**
- Renders nothing when `invitations.length === 0`
- Renders "Pending Invitations" heading and a list of rows when non-empty
- Each row: `invitation.invitedEmailNormalized` + status badge
  - `kind === "sent"` → badge label: **"Invited"**
  - `kind === "pending_approval"` → badge label: **"Pending Approval"**
- No local state, no mutations, no side effects

**What it does not own:**
- Filtering (caller passes only open invitations)
- Revoke / Resend / Approve / Reject actions (out of scope per spec §7)

**Imports:**
- `SentInvitationSummary`, `PendingApprovalInvitationSummary` from `lib/types` (Domain) ✓

---

### 2.5 `ListManagementCard` — anchor ID

**File:** `app/lists/collaborators/page.tsx`

**Layer:** UI — Server Component (inline function)

**What changes:**
- The outer `<div>` of `ListManagementCard` gains `id={`list-${view.list.id}`}`

**Before:**
```tsx
<div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
```

**After:**
```tsx
<div id={`list-${view.list.id}`} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
```

No other changes to this file.

---

## 3. Dependency Direction Audit

| File | Imports from | Direction |
|------|-------------|-----------|
| `getInvitations` (Adapters) | `lib/types` (Domain), `drizzle/schema` (Infra), `auth` (Infra), `permissions` (Application) | ✓ inward / same layer |
| `list.tsx` (UI-Server) | `getInvitations` (Adapters), `lib/types` (Domain) | ✓ inward |
| `ManageCollaborators` (UI-Client) | `PendingInvitationsList` (UI), `InviteByEmailForm` (UI), `lib/types` (Domain) | ✓ same layer / inward |
| `PendingInvitationsList` (UI-Client) | `lib/types` (Domain) | ✓ inward |
| `ListManagementCard` (UI-Server) | No new imports | ✓ unchanged |

**No violations.**

---

## 4. Data Flow per Slice

### Slice 1 — Anchor IDs on Collaborators Page

```
GET /lists/collaborators
  → CollaboratorsPage (server render)
    → ListManagementCard({ view })
      → <div id="list-{view.list.id}"> renders with anchor
Browser: /lists/collaborators#list-{listId} → scrolls to matching div
```

**Files touched:** `app/lists/collaborators/page.tsx`

---

### Slice 2 — Open Invitations Display in Dropdown

```
GET /lists/[listId]
  → list.tsx (server render)
    → getCollaborators(listId) → collaborators[]
    → isAuthorizedToEditCollaborators(...) → editableCollaborators: true
    → getInvitations(listId) [guarded by editableCollaborators]
        → assertCanManageCollaborators(listId, actorId)
        → DB query: SELECT ... FROM invitations WHERE listId=? AND status IN ('sent','pending_approval')
        → returns SentInvitationSummary[] | PendingApprovalInvitationSummary[]
    → on throw: initialInvitations = []
    → ManageCollaborators({ listId, initialCollaborators, initialInvitations })
      → PendingInvitationsList({ invitations: initialInvitations })
        → renders "Pending Invitations" + rows (or nothing if empty)
```

**Files touched:**
- `app/lists/_actions/invitations.ts` (add `getInvitations`)
- `app/lists/_components/list.tsx` (add conditional fetch + prop)
- `app/lists/_components/manage-collaborators.tsx` (add prop + render)
- `app/lists/_components/pending-invitations-list.tsx` (new file)

---

### Slice 3 — Invite by Email Form + "Manage all →" Deep-Link

```
// Form submit:
User types email → clicks "Send Invite"
  → InviteByEmailForm.handleSubmit
    → inviteCollaborator({ listId, invitedEmail }) [existing]
    → toast.success / toast.error [existing]
    → router.refresh() [existing]
      → full server re-render of list.tsx
        → getInvitations re-runs → updated initialInvitations
        → ManageCollaborators re-renders with fresh invitation state

// Deep-link:
User clicks "Manage all →"
  → <a href="/lists/collaborators#list-{listId}"> navigates
    → browser scrolls to <div id="list-{listId}"> (requires Slice 1)
```

**Files touched:**
- `app/lists/_components/manage-collaborators.tsx` (compose `InviteByEmailForm` + add link)

---

## 5. Open Design Notes

| # | Note |
|---|------|
| D-1 | `getInvitations` includes `assertCanManageCollaborators` as a defensive check even though the call site in `list.tsx` already guards on `editableCollaborators`. This follows the existing pattern for all actions in `invitations.ts` and prevents exposure if the action is called outside the guarded render path in the future. |
| D-2 | The "Add New Collaborator" (user search) section in `ManageCollaborators` is not mentioned in the spec's new section order (BR-7) because it is unchanged existing content. It is preserved in its current position between Current Collaborators and the new invitation content. |
| D-3 | `PendingInvitationsList` receives the full `SentInvitationSummary | PendingApprovalInvitationSummary` union so it can render the correct badge per `kind`. No additional filtering is needed — `getInvitations` returns only `sent` and `pending_approval` rows. |
