# Task Breakdown: List Visibility Controls

## Overview
Total Tasks: 4 Task Groups

## Task List

### Database & Types Layer

#### Task Group 1: Schema, Migration, and Type Updates
**Dependencies:** None

- [x] 1.0 Complete database and types layer
  - [x] 1.1 Add ListVisibilityEnum to schema
    - Add to `drizzle/schema.ts`: `export const ListVisibilityEnum = pgEnum("list_visibility", ["private", "public"]);`
    - Follow existing `CollaboratorRoleEnum` pattern
  - [x] 1.2 Add visibility column to ListsTable
    - Field: `visibility: ListVisibilityEnum("visibility").default("private").notNull()`
    - Default value: "private"
  - [x] 1.3 Create migration file
    - Create enum type: `CREATE TYPE "list_visibility" AS ENUM('private', 'public');`
    - Add column: `ALTER TABLE "lists" ADD COLUMN "visibility" "list_visibility" DEFAULT 'private' NOT NULL;`
  - [x] 1.4 Update type definitions in `lib/types.ts`
    - Add: `export type ListVisibility = (typeof ListVisibilityEnum.enumValues)[number];`
    - Update List type to include `visibility` field
  - [x] 1.5 Run migration and verify schema
    - Execute `npx drizzle-kit generate` and `npx drizzle-kit push` or equivalent
    - Verify column exists with correct default

**Acceptance Criteria:**
- ListVisibilityEnum created in schema
- Lists table has visibility column with "private" default
- Migration runs successfully
- TypeScript types updated and compile without errors

---

### Backend Layer

#### Task Group 2: Server Actions and Permissions
**Dependencies:** Task Group 1

- [x] 2.0 Complete server actions and permissions
  - [x] 2.1 Add visibility permission functions to `app/lists/_actions/permissions.ts`
    - Add `isAuthorizedToChangeVisibility()` - checks if user is owner
    - Add `canViewList()` - checks visibility + collaborator status
    - Add `canEditList()` - checks auth + collaborator status
  - [x] 2.2 Update `getList()` in `app/lists/_actions/list.ts`
    - Updated createTaggedList to include visibility field
    - Auth check moved to page-level for proper redirect handling
  - [x] 2.3 Update `getTodos()` in `app/lists/_actions/todo.ts`
    - Visibility check handled at page-level (before component renders)
  - [x] 2.4 Create `updateListVisibility()` server action
    - Location: `app/lists/_actions/list.ts`
    - Validate user is list owner
    - Update visibility field
    - Revalidate paths
    - Return updated list
  - [x] 2.5 Verify server actions work correctly
    - Test getList returns public lists without auth
    - Test getList restricts private lists to collaborators
    - Test updateListVisibility only works for owners

**Acceptance Criteria:**
- Permission functions correctly identify owner/collaborator access
- Public lists accessible without authentication
- Private lists restricted to collaborators
- Only owners can update visibility
- Path revalidation triggers on visibility change

---

### Frontend Layer

#### Task Group 3: UI Components and Integration
**Dependencies:** Task Group 2

- [x] 3.0 Complete UI components
  - [x] 3.1 Install shadcn Switch component
    - Run: `npx shadcn@latest add switch`
    - Verify component available at `@/components/ui/switch`
  - [x] 3.2 Create VisibilityToggle component
    - Location: `app/lists/_components/visibility-toggle.tsx`
    - Props: listId, initialVisibility, onToggle
    - Display Switch with Lock/Globe icon and label
    - Handle pending state during toggle
  - [x] 3.3 Add visibility icon indicator to list header
    - Updated `List` component
    - Show Lock icon for private lists
    - Show Globe icon for public lists
    - Icon visible to all users viewing the list
  - [x] 3.4 Update List component for visibility toggle
    - Location: `app/lists/_components/list.tsx`
    - Add VisibilityToggle next to Manage Collaborators button
    - Only show for list owners (use `isAuthorizedToChangeVisibility`)
    - Wire up `updateListVisibility` server action
  - [x] 3.5 Implement read-only mode for non-collaborators
    - editableList flag controls edit UI visibility
    - Non-collaborators have editableList=false (hides edit controls)
    - Visibility toggle only shown when canChangeVisibility=true
    - Manage Collaborators only shown when editableCollaborators=true
  - [x] 3.6 Update page-level authorization in `app/lists/[listId]/page.tsx`
    - Check list visibility on page load
    - Private lists: redirect unauthenticated to sign-in
    - Private lists: show 404 for non-collaborators
    - Public lists: allow access regardless of auth
  - [x] 3.7 Verify UI renders correctly
    - Visibility toggle appears for owners only
    - Icons display correctly (lock/globe)
    - Toggle persists visibility changes
    - Read-only mode hides all edit controls

**Acceptance Criteria:**
- Switch component installed and functional
- VisibilityToggle shows correct icon/label based on state
- Only owners see visibility toggle
- Non-collaborators see read-only view on public lists
- Unauthenticated users redirected for private lists

---

### Verification Layer

#### Task Group 4: Manual Testing and Verification
**Dependencies:** Task Groups 1-3

- [ ] 4.0 Complete manual testing
  - [ ] 4.1 Test owner visibility controls
    - Owner can toggle visibility private → public
    - Owner can toggle visibility public → private
    - Toggle updates icon (lock ↔ globe) immediately
    - Non-owner collaborators cannot see visibility toggle
  - [ ] 4.2 Test public list access
    - Unauthenticated user can view public list (read-only)
    - Authenticated non-collaborator can view public list (read-only)
    - All edit controls hidden for non-collaborators
  - [ ] 4.3 Test private list access
    - Unauthenticated user cannot view private list (redirect to sign-in)
    - Authenticated non-collaborator cannot view private list (404)
    - Collaborator permissions unchanged by visibility setting
  - [ ] 4.4 Verify existing functionality unaffected
    - Collaborators can still add/edit/delete todos
    - List title editing works for authorized users
    - Manage Collaborators works for owners

**Acceptance Criteria:**
- All 10 manual testing checklist items pass
- No regressions in existing functionality
- Authorization correctly enforced at all levels

---

## Execution Order

Recommended implementation sequence:
1. **Database & Types Layer** (Task Group 1) - Foundation
2. **Backend Layer** (Task Group 2) - Server-side logic
3. **Frontend Layer** (Task Group 3) - UI implementation
4. **Verification Layer** (Task Group 4) - Testing

## Dependencies Summary

```
Task Group 1 (Database/Types)
     ↓
Task Group 2 (Server Actions)
     ↓
Task Group 3 (UI Components)
     ↓
Task Group 4 (Verification)
```

## Key Files to Modify

| File                                          | Changes                                   |
| --------------------------------------------- | ----------------------------------------- |
| `drizzle/schema.ts`                           | Add ListVisibilityEnum, update ListsTable |
| `drizzle/XXXX_*.sql`                          | New migration file                        |
| `lib/types.ts`                                | Add ListVisibility type, update List type |
| `app/lists/_actions/permissions.ts`           | Add visibility permission functions       |
| `app/lists/_actions/list.ts`                  | Update getList, add updateListVisibility  |
| `app/lists/_actions/todo.ts`                  | Update getTodos with visibility check     |
| `app/lists/_components/visibility-toggle.tsx` | New component                             |
| `app/lists/_components/list.tsx`              | Add toggle, read-only mode                |
| `app/lists/[listId]/page.tsx`                 | Page-level authorization                  |
| `components/ui/switch.tsx`                    | New shadcn component (install)            |
