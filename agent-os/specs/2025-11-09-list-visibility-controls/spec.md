# Specification: List Visibility Controls

## Goal
Enable list owners to control whether their lists are private (visible only to collaborators) or public (viewable by anyone with the link), with appropriate authorization updates and read-only access for non-collaborators viewing public lists.

## User Stories
- As a list owner, I want to toggle my list between private and public visibility so that I can control who can see my list
- As a list owner, I want my lists to be private by default so that my content is secure unless I explicitly choose to share it
- As a user with a link to a public list, I want to view the list and its todos so that I can see what's being tracked
- As an unauthenticated user, I want to view public lists (read-only) so that I can see shared content without needing to sign in
- As a collaborator, I want my permissions to remain unchanged regardless of list visibility so that my access isn't affected by the owner's visibility settings

## Core Requirements
- List owners can toggle list visibility between private and public states
- New lists default to private visibility
- Public lists are viewable by anyone with the link (authenticated or unauthenticated)
- Private lists are accessible only to collaborators (existing behavior)
- Unauthenticated users and authenticated non-collaborators have read-only access to public lists
- Collaborators maintain full permissions regardless of visibility setting
- Visual indicators show whether a list is private (lock icon) or public (globe icon)
- Visibility toggle control is only accessible to list owners
- Authorization logic in getList() and getTodos() must check visibility before enforcing collaborator requirements

## Visual Design

### Mockup Reference
- `planning/visuals/Screenshot 2025-11-09 at 1.10.57 PM.png`: Shadcn Switch component example showing toggle pattern with Label and Switch components

### Key UI Elements
- Visibility toggle switch positioned next to the Manage Collaborators section
- Lock icon (from lucide-react) displayed for private lists
- Globe icon (from lucide-react) displayed for public lists
- Toggle label indicates current state: "Private List" or "Public List"
- Toggle is only rendered for list owners
- Icon is visible to all users viewing the list

### Interaction States
- Toggle enabled: Only for list owner
- Toggle disabled: Not shown to collaborators or non-collaborators
- View-only mode: All edit capabilities hidden for non-collaborators viewing public lists
- Full edit mode: Collaborators maintain existing edit capabilities

## Reusable Components

### Existing Code to Leverage

**Database Schema Pattern:**
- File: `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/drizzle/schema.ts`
- Pattern: `export const CollaboratorRoleEnum = pgEnum("collaborator_role", ["owner", "collaborator"]);`
- Usage: Follow this pattern for `ListVisibilityEnum`

**Permission Checking:**
- File: `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/app/lists/_actions/permissions.ts`
- Functions: `isAuthorizedToEditList()`, `isAuthorizedToEditCollaborators()`
- Usage: Reference for implementing visibility-based authorization logic

**List Component Structure:**
- File: `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/app/lists/_components/list.tsx`
- Lines: 64-96 show header layout with title, avatars, and Manage Collaborators dropdown
- Usage: Add visibility toggle near line 77, next to the Manage Collaborators button

**Icon Library:**
- Package: `lucide-react` (already installed)
- Existing usage: `XIcon`, `ChevronDown`, `ArrowUpDown`, `HomeIcon`, `LogOutIcon`
- Usage: Import `Lock` and `Globe` icons for visibility indicators

**List Actions:**
- File: `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/app/lists/_actions/list.ts`
- Function: `getList()` (lines 82-90) - needs authorization update
- Function: `getLists()` (lines 103-156) - may need visibility awareness

**Todo Actions:**
- File: `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/app/lists/_actions/todo.ts`
- Function: `getTodos()` (lines 56-63) - needs authorization update

**Type Definitions:**
- File: `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/lib/types.ts`
- Types: `List`, `ListWithRole`, `User`, `ListUser`
- Usage: Extend `List` type to include visibility property

### New Components Required

**Visibility Toggle Component:**
- New client component for toggle UI
- Cannot reuse: This is a new feature-specific component
- Location: `/app/lists/_components/visibility-toggle.tsx`
- Props: listId, initialVisibility, isOwner
- Uses: shadcn Switch component (needs to be installed if not present)

**Server Action for Visibility Update:**
- New server action to update list visibility
- Cannot reuse: This is new visibility-specific logic
- Location: `/app/lists/_actions/visibility.ts`
- Function: `updateListVisibility(listId, visibility, userId)`

## Technical Approach

### Database Schema Changes

**Add Visibility Enum:**
```
export const ListVisibilityEnum = pgEnum("list_visibility", ["private", "public"]);
```

**Update ListsTable:**
Add visibility column with default value "private":
```
visibility: ListVisibilityEnum("visibility").default("private").notNull()
```

**Migration Required:**
- Create new migration file to add enum type
- Alter lists table to add visibility column
- Set default value to "private" for all existing lists

### Authorization Updates

**Update getList() function:**
- Current state: No authorization (lines 82-90 in list.ts)
- New logic:
  1. Fetch the list from database
  2. Check visibility property
  3. If public: return list immediately
  4. If private: verify user is authenticated and is a collaborator
  5. If not authorized: throw authorization error or return 403

**Update getTodos() function:**
- Current state: No authorization (lines 56-63 in todo.ts)
- New logic:
  1. Fetch the list to check visibility
  2. If public: return todos immediately
  3. If private: verify user is authenticated and is a collaborator
  4. If not authorized: throw authorization error or return empty array

**Considerations:**
- Session/user information needs to be passed to these functions
- Functions should handle unauthenticated users gracefully for public lists
- Private list access for unauthenticated users should result in appropriate error/redirect

### Type System Updates

**Extend List type:**
```typescript
export type List = {
  id: Tagged<...>;
  title: Tagged<...>;
  creatorId: Tagged<...>;
  createdAt: Tagged<...>;
  updatedAt: Tagged<...>;
  visibility: Tagged<(typeof ListVisibilityEnum.enumValues)[number], 'visibility'>;
};
```

**Update createTaggedList function:**
Include visibility property in the returned object

### UI Component Implementation

**Visibility Toggle Component:**
- Renders Switch component from shadcn/ui
- Shows current state with icon (Lock or Globe) and label
- Calls server action on toggle
- Optimistic UI update for better UX
- Only rendered when user is list owner
- Uses loading state during mutation

**List Component Updates:**
- Import and render visibility icon based on list.visibility
- Display icon near the list title for all users
- Conditionally render VisibilityToggle component for owners only
- Pass visibility prop from getList() result

**Read-only Mode Enforcement:**
- Hide "Add Todo" button for non-collaborators viewing public lists
- Hide edit/delete buttons on todos for non-collaborators
- Hide todo status change buttons for non-collaborators
- Maintain display of Manage Collaborators for owners regardless of visibility

### Server Action Implementation

**createVisibilityAction():**
- Location: `/app/lists/_actions/visibility.ts`
- Validation: Check user is list owner before allowing update
- Database: Update visibility field in ListsTable
- Revalidation: Call revalidatePath for affected routes
- Return: Updated list object with new visibility

## Out of Scope

- Public list discovery features (search, browse, directory)
- Analytics or tracking for public list views
- Additional visibility levels (e.g., "unlisted", "password-protected")
- Sharing modal or share link generation UI
- Changing collaborator permissions based on visibility
- Notifications when visibility changes
- Audit log for visibility changes
- Rate limiting for public list access
- SEO optimization for public lists
- Social media preview cards for public lists

## Success Criteria

**Functional Success:**
- List owners can successfully toggle visibility via UI
- Private lists are inaccessible to non-collaborators (return 403 or redirect)
- Public lists are viewable by unauthenticated users with read-only access
- Collaborator permissions are unaffected by visibility changes
- New lists are created with private visibility by default

**Security Success:**
- Private lists cannot be accessed without proper authorization
- Authorization checks happen server-side (not just UI hiding)
- getTodos() and getList() properly enforce visibility rules
- Non-collaborators cannot perform any mutations on public lists

**UX Success:**
- Visibility status is clearly indicated with appropriate icon
- Toggle control is intuitive and provides immediate feedback
- Read-only state is clear to users (edit controls are hidden, not just disabled)
- Page loads successfully for unauthenticated users viewing public lists

**Performance Success:**
- No additional database queries for lists that don't need authorization
- Visibility check is efficient (single field lookup)
- UI toggle provides optimistic updates to feel responsive

## Edge Cases and Error Handling

**Unauthenticated Access:**
- Unauthenticated user views public list: Allow full read access, hide all edit controls
- Unauthenticated user attempts to access private list: Redirect to sign-in or show 403
- Unauthenticated user attempts mutation on public list: Block at server action level, return error

**Authenticated Non-Collaborator Access:**
- Authenticated user views public list: Allow full read access, hide all edit controls
- Authenticated user attempts to access private list: Show 403 or "Access Denied" message
- Authenticated user attempts mutation on public list: Block at server action level, return error

**Owner Permissions:**
- Owner cannot accidentally revoke their own access via visibility change
- Owner maintains full edit permissions on public lists
- Owner can always toggle visibility back to private

**Collaborator Permissions:**
- Existing collaborators maintain their current role permissions regardless of visibility
- New collaborators can be added to public lists same as private lists
- Collaborators can be removed from public lists same as private lists

**Race Conditions:**
- Simultaneous visibility toggles: Last write wins (acceptable for MVP)
- Visibility change during active editing: Existing sessions continue with current permissions
- Collaborator removal during visibility change: Collaborator operations take precedence

**Database Errors:**
- Failed visibility update: Show error message, revert optimistic update
- Database connection issues: Graceful error handling with user-friendly message

**Invalid States:**
- Missing visibility value: Default to "private" for safety
- Invalid visibility enum value: Reject and log error, maintain current state

## Testing Requirements

**Manual Testing**

## Implementation Considerations

**Migration Strategy:**
- Add visibility enum to schema
- Create and run database migration
- All existing lists get "private" default value
- No user action required for existing lists

**Deployment Strategy:**
- Deploy schema changes first
- Deploy backend authorization changes
- Deploy UI changes last
- No downtime expected

**Rollback Plan:**
- Can remove visibility toggle from UI without breaking functionality
- Cannot easily roll back database schema without data loss
- If issues arise, can force all lists to "private" via database update

**Performance Considerations:**
- Add database index on visibility column if needed for filtering

**Security Considerations:**
- All authorization must happen server-side
- Client-side hiding of controls is for UX only, not security
- Server actions must validate user permissions independently
