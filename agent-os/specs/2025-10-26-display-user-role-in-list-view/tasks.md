# Task Breakdown: Display User Role in List View

## Overview
Total Task Groups: 4
Feature: Display user role badges (Owner/Collaborator) in list views with sorting and filtering capabilities

## Task List

### Backend Layer

#### Task Group 1: Database Query and Type Updates
**Dependencies:** None

- [x] 1.0 Complete backend layer for role data
  - [x] 1.1 Modify getLists function in `/app/lists/_actions/list.ts`
    - Add join with ListCollaboratorsTable to include user's role
    - Filter to return lists where: creatorId = userId OR collaborator userId = userId
    - Include role field from ListCollaboratorsTable in query results
    - Ensure owner role is returned for list creators
    - Handle case where user is both creator and collaborator (owner takes precedence)
  - [x] 1.2 Update type definitions in `/lib/types.ts`
    - Create ListWithRole type extending existing List type
    - Add userRole field typed as CollaboratorRoleEnum ("owner" | "collaborator")
    - Ensure type safety for components consuming this data
  - [x] 1.3 Update getLists return type signature
    - Change return type to ListWithRole[] or equivalent
    - Ensure all calling code remains type-safe

**Acceptance Criteria:**
- getLists function returns role information for each list
- Role correctly identifies "owner" for created lists and "collaborator" for shared lists
- Owner role takes precedence when user is both creator and collaborator
- Type definitions properly reflect new data structure

---

### UI Component Layer

#### Task Group 2: Badge Components
**Dependencies:** Task Group 1

- [x] 2.0 Complete badge UI components
  - [x] 2.1 Create base Badge component at `/components/ui/badge.tsx`
    - Follow shadcn/ui component pattern with forwardRef
    - Accept variant prop with theme-based variants: "default" | "primary" | "secondary" | "success" | "destructive" (or similar theme variants)
    - Support children prop for badge text
    - Support className prop for additional styling
    - Use cn utility for className merging
    - Implement responsive sizing: text-xs on mobile (< 768px), text-sm on desktop
    - Theme-based style variants (examples):
      - default: bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300
      - primary: bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300
      - secondary: bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300
    - Pill shape with rounded corners (rounded-full or rounded-lg)
    - Appropriate padding for compact display
    - This component should be reusable for any badge usage in the app
  - [x] 2.2 Create RoleBadge wrapper component at `/components/ui/role-badge.tsx`
    - Accept variant prop: "owner" | "collaborator"
    - Map role variants to Badge theme variants:
      - "owner" -> Badge variant "primary" (or appropriate blue theme variant)
      - "collaborator" -> Badge variant "secondary" (or appropriate gray theme variant)
    - Render Badge component with mapped theme variant
    - Display capitalized text based on role: "Owner" or "Collaborator"
    - Handle edge case of undefined role (default to "Collaborator")
    - This component is role-specific and provides the business logic mapping

**Acceptance Criteria:**
- Base Badge component is reusable with theme-based variants
- Badge component renders correctly with all theme variants
- Proper dark mode support with readable contrast
- RoleBadge correctly maps "owner"/"collaborator" to appropriate Badge theme variants
- RoleBadge displays correct text for each role
- Components follow existing shadcn/ui patterns
- Responsive sizing works on mobile and desktop

---

### Table View Layer

#### Task Group 3: Table View with Sorting and Filtering
**Dependencies:** Task Groups 1, 2

- [x] 3.0 Complete table view with role display, sorting, and filtering
  - [x] 3.1 Create UserListsTable client component at `/app/lists/_components/user-lists-table.tsx`
    - Mark as "use client" directive
    - Accept props: lists (ListWithRole[])
    - Import and use existing DataTable from `/ui/data-table.tsx`
    - Set up state for sorting using @tanstack/react-table SortingState
    - Set up state for filtering: "all" | "owner" | "collaborator" (initial state: "all")
    - Reuse existing table infrastructure patterns
  - [x] 3.2 Implement client-side filtering logic in UserListsTable
    - Create filtering function that filters lists array based on filter state
    - "all": Return all lists (no filtering)
    - "owner": Filter to lists where userRole === "owner"
    - "collaborator": Filter to lists where userRole === "collaborator"
    - Apply filter before passing lists to DataTable
    - Filtering happens entirely in the client component (no server calls)
  - [x] 3.3 Implement filter controls UI in UserListsTable
    - Create filter UI above the table
    - Use existing dropdown-menu component from `/ui/dropdown-menu.tsx` or button group
    - Filter options:
      - "All Lists" (sets filter to "all")
      - "My Lists (Owner)" (sets filter to "owner")
      - "Shared with Me (Collaborator)" (sets filter to "collaborator")
    - Show active filter state in UI (highlight selected option)
    - Update filter state on click (client-side state update)
  - [x] 3.4 Configure DataTable columns in UserListsTable
    - Define column configuration for @tanstack/react-table
    - Columns in order: List Name, Role, Todos, Last Updated
    - List Name column: Link to list detail (reuse existing pattern)
    - Role column:
      - Fixed appropriate width for badge display
      - Center-aligned cell content
      - Render RoleBadge component with variant from userRole field
      - Enable sorting capability on column header
      - Sort order: "owner" before "collaborator"
    - Todos column: Display count (reuse existing pattern)
    - Last Updated column: Display formatted date (reuse existing pattern)
  - [x] 3.5 Update user-lists.tsx page at `/app/lists/user-lists.tsx`
    - Keep as server component
    - Fetch lists with role information using modified getLists
    - Pass lists data to UserListsTable component
    - Remove or replace existing table implementation
  - [x] 3.6 Implement responsive design for table
    - Desktop (>= 768px): Full-size badges with text-sm
    - Mobile (< 768px): Smaller badges with text-xs
    - Ensure table remains usable on small screens
    - Consider horizontal scroll on mobile if needed

**Acceptance Criteria:**
- UserListsTable displays role badges in dedicated column
- Sorting by role works correctly (owner lists first)
- Client-side filtering by role works for all three options (no server calls)
- Filter state updates immediately when user clicks filter option
- Table is responsive across all screen sizes
- Filter controls are intuitive and accessible
- Role column is properly positioned between List Name and Todos

---

### List Detail View Layer

#### Task Group 4: Individual List View Role Display
**Dependencies:** Task Groups 1, 2

- [x] 4.0 Complete individual list detail view role display
  - [x] 4.1 Determine role in list.tsx at `/app/lists/[id]/list.tsx`
    - Access existing collaborators array (already fetched)
    - Find current user in collaborators array
    - Extract role from user's collaborator record
    - Default to "collaborator" if not found
    - Pass role to header/title component
  - [x] 4.2 Update list title area to include role badge
    - Option A: Modify EditableListTitle component to accept and display role badge
    - Option B: Create wrapper component that combines EditableListTitle and RoleBadge
    - Position badge next to title text (after title)
    - Use RoleBadge component with appropriate variant ("owner" or "collaborator")
    - Ensure badge appears on same line on desktop
    - Allow badge to wrap on very small mobile screens if needed
    - Maintain proper spacing with existing header elements
  - [x] 4.3 Implement responsive behavior for badge in header
    - Desktop (>= 768px): Badge on same line as title, text-sm
    - Mobile (< 768px): Badge may wrap, text-xs
    - Ensure badge doesn't interfere with title editing functionality
    - Maintain visual balance in header

**Acceptance Criteria:**
- Role badge appears next to list title in detail view
- Badge shows correct role based on user's collaborator status
- Badge integrates seamlessly with existing title component
- Responsive behavior works correctly on mobile and desktop
- Title editing functionality remains unaffected

---

## Execution Order

Recommended implementation sequence:
1. **Backend Layer** (Task Group 1) - Foundation for role data
2. **UI Component Layer** (Task Group 2) - Reusable badge components
3. **Table View Layer** (Task Group 3) - Main list view with sorting/filtering
4. **List Detail View Layer** (Task Group 4) - Individual list view

## Implementation Notes

### Key Files to Modify
- `/app/lists/_actions/list.ts` - getLists function (Task 1.1)
- `/lib/types.ts` - Type definitions (Task 1.2)
- `/app/lists/user-lists.tsx` - Server component page (Task 3.5)
- `/app/lists/[id]/list.tsx` - Individual list page (Task 4.1, 4.2)

### Key Files to Create
- `/components/ui/badge.tsx` - Base badge component with theme variants (Task 2.1)
- `/components/ui/role-badge.tsx` - Role-specific badge wrapper that maps to Badge theme variants (Task 2.2)
- `/app/lists/_components/user-lists-table.tsx` - Client component for table (Task 3.1)

### Existing Patterns to Follow
- Use existing DataTable patterns from `/ui/data-table.tsx`
- Follow shadcn/ui component conventions
- Reuse existing permission utilities from `/app/lists/_actions/permissions.ts`
- Follow existing type patterns from `/lib/types.ts`
- Use existing dropdown-menu component from `/ui/dropdown-menu.tsx`

### Component Architecture
```
Badge (base component)
  - Accepts theme variants: "default" | "primary" | "secondary" | etc.
  - Reusable for any badge usage in the app
  - No business logic, just styling

RoleBadge (role-specific wrapper)
  - Accepts role variants: "owner" | "collaborator"
  - Maps role to appropriate Badge theme variant
  - Provides role-specific text ("Owner" / "Collaborator")
  - Contains business logic for role display
```

### Technical Considerations
- Role determination logic should reuse existing database schema (CollaboratorRoleEnum)
- **Filtering is entirely client-side** in UserListsTable (lists already loaded, no server calls)
- **Sorting is handled by @tanstack/react-table** (client-side)
- Single database query with join (no additional API calls for role data)
- Owner role takes precedence when user is both creator and collaborator
- Dark mode support required for all badge variants
- Base Badge component should be reusable beyond just role display

### Responsive Design Requirements
- Desktop (>= 768px): text-sm badges, full layout
- Mobile (< 768px): text-xs badges, may need horizontal scroll for table
- Badge should not break layout with long list titles
- Filter controls must be usable on mobile

### Edge Cases to Handle
- User has no lists - show empty state
- User is both creator and collaborator - show "owner"
- List with no role information - default to "collaborator"
- Very long list titles - badge should not cause overflow
- Dark mode - ensure sufficient contrast
- Filtering with no results - show appropriate empty state message

### Accessibility Requirements
- Badge text must have sufficient color contrast (WCAG AA)
- Role column header must be properly labeled for screen readers
- Filter controls must be keyboard navigable
- Sorting controls must be keyboard accessible

### Manual Testing Checklist
After implementation, verify:
- [ ] Visual design matches theme in light mode
- [ ] Visual design matches theme in dark mode
- [ ] Works correctly on mobile device (or responsive mode)
- [ ] Works correctly on desktop device
- [ ] Badge colors have sufficient contrast
- [ ] Keyboard navigation through filter controls works
- [ ] Keyboard navigation through sortable columns works
- [ ] Long list titles don't break badge layout
- [ ] Works with user who has no lists
- [ ] Works with user who only has owned lists
- [ ] Works with user who only has collaborative lists
- [ ] Works with user who has mixed lists
- [ ] Client-side filtering from "All" to "My Lists" to "Shared with Me" works instantly
- [ ] Sorting by role puts owners first, then collaborators
- [ ] Navigation from table to detail shows consistent role
- [ ] No performance degradation in page load time
- [ ] Filtering happens without server calls (check network tab)
- [ ] Base Badge component could be reused for other badge needs
