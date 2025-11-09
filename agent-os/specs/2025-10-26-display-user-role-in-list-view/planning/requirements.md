# Requirements: Display User Role in List View

## Feature Description
Make it clear whether the user is a collaborator or an owner anytime they are viewing list information.

## Requirements Gathered

### 1. Display Locations
- **Main list view (table layout)**: Display in a dedicated "Role" column
- **Individual list detail view**: Display next to the list title

### 2. Visual Treatment
- **Style**: Badge/pill with text
- **Color**: Muted colors that fit the existing theme
- **Components**: Use shadcn elements as necessary for consistency

### 3. Role Terminology
- Display as: "Owner" and "Collaborator" (capitalize first letter)

### 4. Responsive Design
- **Behavior**: Consistent display across all screen sizes
- **Mobile adjustment**: Smaller font size on mobile devices
- **Layout**: Same badge/pill style on both desktop and mobile

### 5. Positioning
- **Table layout**: Dedicated "Role" column
- **Individual list view**: Badge next to the list title

### 6. Interactive Features
- **Sorting**: Enable sorting by role in the table view
- **Filtering**: Enable filtering by role (e.g., "Show only lists I own" or "Show only lists I collaborate on")

### 7. Scope Limitations
- Only display role indicators in the two specified locations
- No role indicators in: deletion dialogs, notifications, emails, or other UI areas
- Keep it simple and focused on the list views

### 8. Design Consistency
- Use existing Tailwind theme colors
- Leverage shadcn/ui components where applicable
- Match current design patterns and visual language

## Technical Considerations
- Need to determine user's role for each list (owner vs collaborator)
- Role information should come from existing authorization/permissions logic
- Table sorting will need to support role as a sortable column
- Table filtering will need to support filtering by role
- Badge component may need to be created or reused from shadcn

## Visual Assets
None provided - implement consistent with current theme
