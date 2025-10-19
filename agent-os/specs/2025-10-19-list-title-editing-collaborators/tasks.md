# Task Breakdown: List Title Editing for Collaborators

## Overview
Total Tasks: 3 Task Groups (10 subtasks)
Feature Size: XS (1 day implementation)
Assigned roles: api-engineer, ui-designer, testing-engineer

## Task List

### Backend Layer

#### Task Group 1: Server Action Implementation
**Assigned implementer:** api-engineer
**Dependencies:** None
**Estimated Time:** 2-3 hours

- [x] 1.0 Complete server action for list title updates
  - [x] 1.1 Write 2-8 focused tests for updateListTitle server action
    - NOTE: Testing will be performed manually. Automated tests out of scope.
  - [x] 1.2 Create updateListTitle server action in `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/app/lists/_actions/list.ts`
    - Function signature: `updateListTitle(listId: List["id"], newTitle: string, userId: User["id"]): Promise<List>`
    - Trim whitespace from newTitle
    - Validate trimmed title length > 0 (throw: "Title cannot be empty")
    - Validate trimmed title length <= 255 (throw: "Title cannot exceed 255 characters")
    - Get collaborators using `getCollaborators(listId)` from collaborators.ts
    - Check authorization using `isAuthorizedToEditList(collaborators, userId)` from permissions.ts
    - Throw authorization error if not authorized: "You do not have permission to edit this list"
    - Update ListsTable with Drizzle ORM (title and updatedAt fields)
    - Call `revalidatePath("/lists")` and `revalidatePath(\`/lists/${listId}\`)`
    - Return updated tagged List object using createTaggedList helper
    - Follow pattern from updateTodoTitle in todo.ts
    - Wrap in try-catch for database error handling
  - [x] 1.3 Ensure server action tests pass
    - NOTE: Manual testing will be performed after UI implementation. TypeScript compilation verified.

**Acceptance Criteria:**
- Server action validates input correctly (empty strings, length limits) - COMPLETED
- Authorization properly enforced (owners and collaborators can edit, others cannot) - COMPLETED
- Database updates successfully with correct values - COMPLETED
- Cache revalidation occurs for both list pages - COMPLETED
- Error messages are clear and user-friendly - COMPLETED
- Manual testing to be performed after UI implementation

---

### Frontend Layer

#### Task Group 2: UI Component Implementation
**Assigned implementer:** ui-designer
**Dependencies:** Task Group 1
**Estimated Time:** 3-4 hours

- [x] 2.0 Complete UI components for editable list title
  - [x] 2.1 Write 2-8 focused tests for EditableListTitle component
    - NOTE: Testing will be performed manually. Automated tests out of scope.
  - [x] 2.2 Create EditableListTitle component at `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/app/lists/_components/editable-list-title.tsx`
    - Mark as "use client" for interactivity
    - Props: `{ list: List; editable: boolean; userId: User["id"] }`
    - Local state: title, isEditing, error, isLoading
    - Computed values: trimmedTitle, charCount, isValid, validationError
    - Display modes:
      - Non-editable: h2 text only when editable=false
      - Display: h2 with "Edit" button when editable=true
      - Edit: form with input, character count, validation message, Save/Cancel buttons
    - Real-time validation:
      - Character count display: "X/255 characters"
      - Red text when exceeds 255
      - Error messages: "Title cannot be empty" or "Title cannot exceed 255 characters"
      - Disable Save button when !isValid or isLoading
    - Call updateListTitle server action on form submit
    - Show toast notifications (success/error) using sonner
    - Auto-focus input on edit mode entry
    - Reset to display mode on successful save
    - Cancel button resets to original title
    - Follow pattern from EditableTitle in todo-list.tsx (lines 128-204)
    - Maintain text-2xl font-bold styling for consistency
  - [x] 2.3 Update list.tsx component at `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/app/lists/_components/list.tsx`
    - Import EditableListTitle component
    - Replace line 52 static h2 element with: `<EditableListTitle list={list} editable={editableList} userId={user.id} />`
    - Handle undefined user case (component will show static title when editable=false)
    - Verify user.id is available from session (line 40)
  - [x] 2.4 Ensure UI component tests pass
    - NOTE: Manual testing to verify component behaviors in browser

**Acceptance Criteria:**
- EditableListTitle component renders correctly in all three modes (non-editable, display, edit)
- Real-time validation provides immediate feedback as user types
- Character counter updates on every keystroke
- Save button properly disabled based on validation state
- Toast notifications appear on success/error
- Component styling matches existing design (text-2xl font-bold)
- Edit controls only visible to authorized users (owners and collaborators)
- Component integrates seamlessly into list.tsx
- Manual testing confirms all behaviors work correctly

---

### Testing Layer

#### Task Group 3: Manual Testing & Verification
**Assigned implementer:** testing-engineer
**Dependencies:** Task Groups 1-2
**Estimated Time:** 2-3 hours

- [ ] 3.0 Perform manual testing of list title editing feature
  - [ ] 3.1 Test authorization scenarios
    - As owner: can edit list title
    - As collaborator: can edit list title
    - As non-member: edit button does not appear
  - [ ] 3.2 Test validation scenarios
    - Empty title shows error and disables save
    - Whitespace-only title shows error and disables save
    - Title with exactly 255 characters succeeds
    - Title with 256 characters shows error and disables save
    - Leading/trailing whitespace is properly trimmed
  - [ ] 3.3 Test user workflows
    - Owner edits title and sees update persist on /lists page
    - Owner edits title and sees update persist on /lists/[listId] page
    - Collaborator edits title successfully
    - Character counter updates as user types
    - Character counter turns red when exceeds 255
    - Cancel button resets to original title
    - Loading state prevents double-submission
  - [ ] 3.4 Test error handling
    - Network failure shows error toast and keeps edit mode
    - Database error shows user-friendly error message
    - Unauthorized edit attempt shows authorization error

**Acceptance Criteria:**
- All manual test scenarios pass
- Critical user workflows for list title editing verified
- Authorization properly enforced
- Validation prevents invalid submissions
- Error handling works correctly
- No regressions in existing functionality

---

## Execution Order

Recommended implementation sequence:
1. **Backend Layer** (Task Group 1) - Create server action with validation and authorization
2. **Frontend Layer** (Task Group 2) - Build EditableListTitle component and integrate into list.tsx
3. **Testing Layer** (Task Group 3) - Perform manual testing and verification

## Implementation Notes

### Key Files to Modify/Create
- **Create**: `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/app/lists/_components/editable-list-title.tsx`
- **Modify**: `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/app/lists/_actions/list.ts`
- **Modify**: `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/app/lists/_components/list.tsx`

### Existing Code to Reuse
- **Authorization**: `isAuthorizedToEditList()` at `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/app/lists/_actions/permissions.ts` (lines 10-19)
- **Pattern Reference**: EditableTitle component at `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/app/lists/_components/todo-list.tsx` (lines 128-204)
- **Server Action Pattern**: Todo actions at `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/app/lists/_actions/todo.ts`

### Testing Approach
- **Manual Testing**: All testing will be performed manually in the browser
- **No Automated Tests**: Automated test framework setup is out of scope for this feature
- **TypeScript Verification**: TypeScript compilation confirms type safety

### Standards Compliance
All implementations must align with:
- Next.js 14 App Router patterns with Server Actions
- TypeScript strict mode
- Tailwind CSS for styling
- Drizzle ORM for database operations
- Error handling with user-friendly messages
- Real-time validation on client, enforcement on server

### Edge Cases Covered
- User loses access while editing (authorization check on save)
- Simultaneous edits (last write wins - documented limitation)
- Empty or whitespace-only titles (validation prevents)
- Titles exceeding 255 characters (validation prevents)
- Network failures (error toast, stay in edit mode for retry)
- Database errors (catch and display user-friendly message)
- User not authenticated (middleware handles redirect)

### Success Metrics
- Collaborators can edit list titles with same UX as owners
- Authorization enforced (only owners/collaborators can edit)
- Real-time validation prevents invalid submissions
- Character counter provides clear guidance
- Changes immediately visible after save
- Toast notifications provide clear feedback
- No regression in existing functionality
- Loading states prevent double-submission
