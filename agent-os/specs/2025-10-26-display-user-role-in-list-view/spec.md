# Specification: Display User Role in List View

## Goal
Display the user's role (Owner/Collaborator) in list views with visual badges, enabling users to quickly identify their relationship to each list and filter/sort lists by role.

## User Stories
- As a user viewing my lists, I want to see whether I'm an owner or collaborator so that I understand my permissions at a glance
- As a user with many lists, I want to sort by role so that I can prioritize my owned lists or find lists where I'm a collaborator
- As a user managing multiple collaborations, I want to filter by role so that I can focus on just my owned lists or collaborative lists

## Core Requirements
- Display role badges in two locations: main list table view and individual list detail view
- Show "Owner" for lists created by the user and "Collaborator" for lists where user was added
- Enable sorting by role in the table view (Owner first, then Collaborator)
- Enable filtering by role with options: "All Lists", "My Lists (Owner)", "Shared with Me (Collaborator)"
- Use muted, theme-consistent colors for badges
- Maintain responsive design across all screen sizes

## Visual Design
No mockups provided - implementation should follow existing design patterns.

### Badge Component
- Create a new Badge component using shadcn/ui conventions
- Style: Pill/badge shape with rounded corners
- Colors:
  - Owner: Muted blue/primary color (e.g., bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300)
  - Collaborator: Muted gray/secondary color (e.g., bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300)
- Text: Capitalized ("Owner" or "Collaborator")
- Size: Small, compact design that doesn't dominate the UI
- Responsive: Slightly smaller font on mobile (text-xs on mobile, text-sm on desktop)

### Table View (user-lists.tsx)
- Add new "Role" column between "List Name" and "Todos"
- Column width: Fixed appropriate width for badge display
- Position badge center-aligned in the cell
- Add sorting capability to the Role column header
- Add filter controls above or beside the table

### Individual List View (list.tsx)
- Position badge next to the list title (after the title text)
- Integrate seamlessly with existing EditableListTitle component
- Badge should appear on same line as title on desktop, may wrap on very small mobile screens
- Maintain spacing consistency with existing header elements

### Responsive Breakpoints
- Desktop (>= 768px): Full-size badges, text-sm
- Mobile (< 768px): Smaller badges, text-xs
- Maintain consistent styling and visibility across all sizes

## Reusable Components
### Existing Code to Leverage
- Table components: /ui/table.tsx (TableHead, TableCell, TableRow)
- Data table: /ui/data-table.tsx (sorting infrastructure with @tanstack/react-table)
- Permission utilities: /app/lists/_actions/permissions.ts (role determination logic)
- Type definitions: /lib/types.ts (ListUser type with Role field)
- Database schema: /drizzle/schema.ts (CollaboratorRoleEnum with "owner" and "collaborator")
- List data fetching: /app/lists/_actions/list.ts (getLists function)
- Existing collaborator role display: /app/lists/_components/collaborator-list-item.tsx (shows role as text)

### New Components Required
- Badge component (/ui/badge.tsx or /components/ui/badge.tsx): No existing badge component found in codebase
- RoleBadge wrapper component: Specialized badge that takes a role and renders appropriate styled badge
- UserListsTable component: Client component that wraps the data table with sorting and filtering
- Filter controls component: UI for filtering lists by role (can use existing dropdown-menu.tsx from /ui)

## Technical Approach

### Role Determination Logic
- Use existing CollaboratorRoleEnum from database schema ("owner" | "collaborator")
- For each list in getLists, determine user's role by:
  1. Check if user is in ListCollaboratorsTable for that list
  2. Retrieve the role field from ListCollaboratorsTable
  3. Default to "collaborator" if role not explicitly set (per schema default)
- Modify getLists function to include role information in returned data
- Create type-safe interface extending List type to include userRole field

### Table View Implementation
- Keep user-lists.tsx as a server component
- Create new UserListsTable.tsx as a client component
- UserListsTable receives lists with role data as props
- UserListsTable implements:
  - State for sorting (using @tanstack/react-table SortingState)
  - State for filtering (simple string state: "all" | "owner" | "collaborator")
  - Filter UI above the table
  - DataTable with role column configuration
  - Column definitions for: List Name, Role (with badge), Todos, Last Updated
- Update getLists to return role information for current user
- user-lists.tsx passes data to UserListsTable component

### Individual List View Implementation
- Modify list.tsx to pass role information to header
- Update EditableListTitle or create wrapper component to display badge
- Determine role from collaborators array (already fetched in component)
- Use existing isAuthorizedToEditCollaborators to infer owner status, or directly check role from collaborators

### Badge Component Specifications
- Accept props: variant ("owner" | "collaborator"), children (text)
- Use className prop for additional styling
- Follow shadcn/ui component pattern with forwardRef
- Use cn utility for className merging
- Support dark mode styling

### Data Flow
1. Server: getLists modified to join with ListCollaboratorsTable and include user's role
2. Server: user-lists.tsx fetches lists with role information
3. Server: user-lists.tsx passes data to UserListsTable (client component)
4. Client: UserListsTable manages filtering state
5. Client: UserListsTable applies filtering to lists data
6. Client: UserListsTable manages sorting via @tanstack/react-table
7. Client: DataTable renders with role column showing badges
8. Server: list.tsx determines role from existing collaborators data
9. Client: Display badge next to title in list detail view

## Out of Scope
- Role badges in deletion dialogs
- Role badges in notifications or emails
- Role badges in other UI areas beyond list table and detail views
- Ability to change user's role from these views (managed separately)
- Custom role types beyond Owner/Collaborator
- Role-based access control changes (use existing permissions)

## Success Criteria
- Users can immediately see their role for each list in the table view
- Users can sort lists by role to group owned and collaborative lists
- Users can filter to show only owned lists or only collaborative lists
- Role badge is visible next to the list title in detail view
- Badge design is consistent with existing theme and color palette
- All functionality works correctly on mobile and desktop devices
- No performance degradation when loading lists with role information
- Proper type safety maintained throughout implementation

## Technical Considerations

### Edge Cases
- User has no lists: Show empty state with no filters applied
- User is both creator and collaborator: Should show "owner" role (owner takes precedence)
- List with no role information: Fallback to "collaborator" (schema default)
- Very long list titles: Badge should not cause layout issues
- Dark mode: Ensure badge colors are readable in both light and dark themes

### Performance
- Role information should be fetched in single query (join with lists query)
- Filtering should be client-side in UserListsTable (lists already loaded)
- Sorting handled efficiently by @tanstack/react-table
- No additional API calls required for role display

### Accessibility
- Badge text should be readable (sufficient color contrast)
- Role column should have proper heading for screen readers
- Filter controls should be keyboard navigable
- Sorting controls should be accessible via keyboard

### Database Queries
- Modify getLists to include role from ListCollaboratorsTable:
  - Join ListsTable with ListCollaboratorsTable on listId
  - Filter where creatorId = userId OR collaborator userId = userId
  - Select role field from join
  - For lists where user is creator, role should be "owner"
  - For lists where user is added as collaborator, use their role from table

### Type Safety
- Extend List type or create ListWithRole type
- Ensure role field is properly typed using CollaboratorRoleEnum
- Update function signatures to reflect new return types
- Maintain type safety through component prop types

### Component Structure
```
user-lists.tsx (Server Component)
  └── UserListsTable.tsx (Client Component)
      ├── Filter Controls (Dropdown or Buttons)
      └── DataTable
          └── Role Column with RoleBadge
```
