# Requirements: List Title Editing for Collaborators

## Feature Description
Enable collaborators to edit the title of lists they have access to, extending this capability beyond just list owners.

## Current Behavior
- Only list owners can edit list titles
- Collaborators can view lists but cannot modify the title
- Authorization checks restrict title editing to owners only

## Desired Behavior
- Both owners AND collaborators can edit list titles
- Authorization checks validate that user is either owner or collaborator
- UI reflects new permissions (edit controls visible to collaborators)

## Technical Requirements

### Authorization
- Update permission utilities to allow title editing for collaborators
- Maintain existing owner permissions
- Validate user is either owner or collaborator before allowing edits
- Ensure only authorized users (owners and collaborators) can edit list titles

### Backend
- Update list update API/server actions to accept title edits from collaborators
- Maintain proper error handling for unauthorized users

### Frontend
- Update UI components to show title editing controls to collaborators
- Maintain consistent UX with current owner editing experience
- Handle loading/error states appropriately

### Data Integrity
- Validate list title input (non-empty, length constraints)
- Prevent unauthorized access
- Maintain referential integrity with collaborators table

## User Stories
1. As a collaborator, I want to edit the title of lists I have access to, so that I can help organize and maintain shared lists
2. As a list owner, I want collaborators to be able to update list titles, so that list maintenance is collaborative

## UI/UX Considerations
- Use existing UI components (current implementation with Radix UI)
- Maintain consistent editing experience between owners and collaborators
- Consider using existing shadcn/ui components if new UI elements are needed

## Edge Cases
- User loses collaborator access while editing title
- Multiple users editing title simultaneously
- Empty or whitespace-only titles
- Very long titles (database constraints)

## Non-Goals
- This does NOT include:
  - Changing list ownership
  - Editing other list properties beyond title
  - Adding new collaboration features
  - Notification system for title changes
  - Audit logging of changes (future roadmap item)

## Success Metrics
- Collaborators can successfully edit list titles
- No regression in owner title editing functionality
- Authorization properly enforced
- UI updates correctly reflect new permissions
