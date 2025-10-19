# Specification: List Title Editing for Collaborators

## Goal
Enable collaborators with the "collaborator" role to edit list titles, extending this capability beyond just list owners. This change makes list maintenance truly collaborative while maintaining proper authorization and a consistent user experience.

## User Stories
- As a collaborator, I want to edit the title of lists I have access to, so that I can help organize and maintain shared lists
- As a list owner, I want collaborators to be able to update list titles, so that list maintenance is collaborative

## Core Requirements

### Functional Requirements
- Collaborators with "collaborator" role can edit list titles (currently only "owner" role can)
- List title editing UI appears for both owners and collaborators
- Title validation: non-empty, trimmed strings with max 255 characters
- Real-time validation feedback as user types (character count, error states)
- Save button disabled when validation fails
- Real-time feedback on save success/failure via toast notifications
- Changes immediately reflected in UI after successful save

### Non-Functional Requirements
- Maintain existing editing experience (inline editing with Edit/Save buttons)
- No performance degradation on list page load
- Graceful error handling for authorization failures
- Consistent validation between client and server

## Visual Design
- No mockups provided - reuse existing inline editing pattern from todo title editing
- List title displayed as editable text in the header (h2 element at `app/lists/_components/list.tsx:52`)
- When editable, show text with an "Edit" button
- During edit mode:
  - Input field with current title
  - Character counter showing "X/255 characters" below input
  - Error message in red when validation fails
  - Save button (disabled when invalid, enabled when valid)
- Match the EditableTitle component pattern from `app/lists/_components/todo-list.tsx:128-204`

## Reusable Components

### Existing Code to Leverage
- **Permission Check Pattern**: `isAuthorizedToEditList()` function at `app/lists/_actions/permissions.ts:10-19` - Already checks for both "owner" and "collaborator" roles in `ALLOWED_TO_EDIT_LIST_ROLES`
- **Server Action Pattern**: Todo CRUD actions at `app/lists/_actions/todo.ts` - Use similar pattern for updateListTitle
- **Inline Editing Component**: EditableTitle component at `app/lists/_components/todo-list.tsx:128-204` - Replicate this pattern for list title editing
- **Toast Notifications**: sonner toast implementation in todo-list.tsx - Use for success/error feedback
- **Validation Pattern**: Title validation logic at `app/lists/_components/todo-list.tsx:144-148` - Extend with character count
- **Server Action Direct Call**: Call server action directly since revalidatePath will handle cache updates

### New Components Required
- **EditableListTitle**: New component similar to EditableTitle but with character counter and real-time validation
- **updateListTitle**: New server action in `app/lists/_actions/list.ts`

## Technical Approach

### Database
- **No schema changes required** - Lists table at `drizzle/schema.ts:30-38` already has title field with proper constraints
- Update operations will modify ListsTable.title and ListsTable.updatedAt
- Leverage existing ListCollaboratorsTable for authorization checks

### Backend (Server Actions)

#### New Server Action: updateListTitle
**File**: `app/lists/_actions/list.ts`

**Function Signature**:
```typescript
export async function updateListTitle(
  listId: List["id"],
  newTitle: string,
  userId: User["id"]
): Promise<List>
```

**Implementation Requirements**:
- Accept listId, newTitle, and userId as parameters
- Trim whitespace from title
- Validate trimmed title length > 0 (throw error: "Title cannot be empty")
- Validate trimmed title length <= 255 characters (throw error: "Title cannot exceed 255 characters")
- Get collaborators by calling `getCollaborators(listId)` from collaborators.ts
- Use `isAuthorizedToEditList(collaborators, userId)` from permissions.ts to verify user can edit
- Throw authorization error if user not authorized: "You do not have permission to edit this list"
- Update ListsTable using Drizzle ORM:
  - Set title to trimmed newTitle
  - Set updatedAt to current timestamp
  - Use `where(eq(ListsTable.id, listId))`
- Call `revalidatePath("/lists")` to update lists overview page
- Call `revalidatePath(\`/lists/${listId}\`)` to update individual list page
- Return updated tagged List object using createTaggedList helper
- Wrap in try-catch to handle database errors with user-friendly messages

**Pattern to Follow**: Similar to `updateTodoTitle` at `app/lists/_actions/todo.ts:32-43`

**Example Implementation Structure**:
```typescript
export async function updateListTitle(
  listId: List["id"],
  newTitle: string,
  userId: User["id"]
): Promise<List> {
  const db = drizzle(sql);

  // Validate
  const trimmedTitle = newTitle.trim();
  if (!trimmedTitle) {
    throw new Error("Title cannot be empty");
  }
  if (trimmedTitle.length > 255) {
    throw new Error("Title cannot exceed 255 characters");
  }

  // Authorize
  const collaborators = await getCollaborators(listId);
  if (!isAuthorizedToEditList(collaborators, userId)) {
    throw new Error("You do not have permission to edit this list");
  }

  // Update
  const [updatedList] = await db
    .update(ListsTable)
    .set({
      title: trimmedTitle,
      updatedAt: new Date()
    })
    .where(eq(ListsTable.id, listId))
    .returning();

  // Revalidate
  revalidatePath("/lists");
  revalidatePath(`/lists/${listId}`);

  return createTaggedList(updatedList);
}
```

### Frontend

#### New Component: EditableListTitle
**File**: `app/lists/_components/editable-list-title.tsx` (new file)

**Props**:
```typescript
interface EditableListTitleProps {
  list: List;
  editable: boolean;
  userId: User["id"];
}
```

**Implementation Requirements**:
- Mark component as "use client" since it has interactivity
- Local state:
  - title: string (current input value)
  - isEditing: boolean (edit mode toggle)
  - error: string | null (validation error message)
  - isLoading: boolean (saving state)
- Computed values:
  - trimmedTitle: title.trim()
  - charCount: trimmedTitle.length
  - isValid: charCount > 0 && charCount <= 255
  - validationError: computed error message based on title state
- Display modes:
  - Non-editable: h2 with text only when editable is false
  - Display mode: h2 with text and "Edit" button when editable is true
  - Edit mode: form with input, character count, validation message, and Save button
- Real-time validation:
  - Show character count "X/255 characters" below input
  - Show error message in red when validation fails:
    - If empty after trimming: "Title cannot be empty"
    - If exceeds 255 chars: "Title cannot exceed 255 characters"
  - Disable Save button when !isValid or isLoading
- Call updateListTitle server action directly on form submit
- Use try-catch for error handling
- Show toast notifications on success/failure
- Auto-focus input field when entering edit mode
- Reset to display mode on successful save
- Maintain styling consistent with list.tsx (text-2xl font-bold for h2)

**Pattern to Follow**: Based on EditableTitle component at `app/lists/_components/todo-list.tsx:128-204`, enhanced with character counter

**Example Implementation Structure**:
```typescript
"use client";

import { useState, useMemo } from "react";
import { Button } from "@/ui/button";
import { toast } from "sonner";
import { updateListTitle } from "@/app/lists/_actions/list";
import type { List, User } from "@/lib/types";

interface EditableListTitleProps {
  list: List;
  editable: boolean;
  userId: User["id"];
}

const MAX_TITLE_LENGTH = 255;

export default function EditableListTitle({ list, editable, userId }: EditableListTitleProps) {
  const [title, setTitle] = useState(list.title);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Compute validation state
  const trimmedTitle = useMemo(() => title.trim(), [title]);
  const charCount = trimmedTitle.length;
  const isValid = charCount > 0 && charCount <= MAX_TITLE_LENGTH;

  const validationError = useMemo(() => {
    if (charCount === 0) return "Title cannot be empty";
    if (charCount > MAX_TITLE_LENGTH) return `Title cannot exceed ${MAX_TITLE_LENGTH} characters`;
    return null;
  }, [charCount]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValid) {
      setError(validationError);
      toast.error(validationError || "Invalid title");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await updateListTitle(list.id, title, userId);
      setIsEditing(false);
      toast.success("List title updated");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update list title";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setTitle(list.title); // Reset to original
    setIsEditing(false);
    setError(null);
  };

  if (!editable) {
    return <h2 className="text-2xl font-bold">{list.title}</h2>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row gap-2 items-center">
        {isEditing ? (
          <form onSubmit={handleSave} className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="px-3 py-2 border rounded-md text-2xl font-bold"
                autoFocus
                disabled={isLoading}
              />
              <Button
                type="submit"
                variant="outline"
                disabled={!isValid || isLoading}
              >
                {isLoading ? "Saving..." : "Save"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={handleCancel}
                disabled={isLoading}
              >
                Cancel
              </Button>
            </div>
            <div className="flex flex-col gap-1">
              <span className={`text-sm ${charCount > MAX_TITLE_LENGTH ? 'text-red-500' : 'text-gray-500'}`}>
                {charCount}/{MAX_TITLE_LENGTH} characters
              </span>
              {validationError && (
                <span className="text-red-500 text-sm">{validationError}</span>
              )}
              {error && (
                <span className="text-red-500 text-sm">{error}</span>
              )}
            </div>
          </form>
        ) : (
          <>
            <h2 className="text-2xl font-bold">{list.title}</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              Edit
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
```

#### Update: list.tsx Component
**File**: `app/lists/_components/list.tsx`

**Changes Required**:
- Import EditableListTitle component
- Extract user ID from session (already available at line 40)
- Replace line 52 static h2 element with EditableListTitle component
- Pass list object, editableList boolean, and user.id as props

**Before (line 52)**:
```typescript
<h2 className="text-2xl font-bold">{list.title}</h2>
```

**After**:
```typescript
<EditableListTitle list={list} editable={editableList} userId={user.id} />
```

**Note**: Need to handle case when user is undefined - if user is undefined, editableList will be false anyway, so component can safely display static title

### Authorization Logic
- **No changes to permissions.ts required** - `isAuthorizedToEditList()` at `app/lists/_actions/permissions.ts:10-19` already includes both owner and collaborator roles in ALLOWED_TO_EDIT_LIST_ROLES
- Server action must call `getCollaborators(listId)` then `isAuthorizedToEditList(collaborators, userId)`
- Client receives editableList boolean from list.tsx which drives UI visibility (calculated at line 42)

### Validation

**Client-Side Real-Time Validation** (in EditableListTitle component):
- Compute trimmed title length on every keystroke
- Display character count "X/255 characters"
- Show red text when count exceeds 255
- Display validation error message when:
  - Trimmed title is empty: "Title cannot be empty"
  - Character count exceeds 255: "Title cannot exceed 255 characters"
- Disable Save button when !isValid (empty or too long)
- Prevent form submission when !isValid

**Server-Side Validation** (in updateListTitle action):
- Trim whitespace from title
- Validate trimmed title length > 0
- Validate trimmed title length <= 255 characters
- Throw descriptive error if validation fails
- Validation must occur before authorization check for fail-fast approach

### Testing Requirements

#### Unit Tests
- Test `updateListTitle` server action:
  - Valid input with authorized owner returns updated list
  - Valid input with authorized collaborator returns updated list
  - Unauthorized user throws authorization error
  - Empty string throws validation error
  - Whitespace-only string throws validation error
  - String exceeding 255 characters throws validation error
  - Invalid listId throws not found error

#### Integration Tests
- Test EditableListTitle component:
  - Renders static h2 when editable is false
  - Renders h2 with Edit button when editable is true
  - Clicking Edit shows input field, character count, and Save button
  - Character count updates as user types
  - Character count turns red when exceeds 255
  - Save button disabled when title empty
  - Save button disabled when title exceeds 255 characters
  - Validation error message appears when title invalid
  - Submitting valid title updates and shows success toast
  - Server error shows error toast and keeps edit mode
  - Cancel button resets title to original value
  - Loading state disables all form controls

#### E2E Tests
- As owner: navigate to list, edit title, verify update persists on page and in /lists
- As collaborator: navigate to shared list, edit title, verify update persists
- As non-member: verify edit button does not appear
- Test typing title exceeding 255 characters shows error and disables save
- Test entering empty title shows error and disables save
- Verify title changes reflect on both /lists and /lists/[listId] pages

## Out of Scope
- Changing list ownership or creator
- Editing other list properties (createdAt, updatedAt, creatorId)
- Adding notification system for title changes
- Audit logging of title changes
- Optimistic locking for concurrent edits
- Undo/redo functionality
- Title change history

## Edge Cases and Error Handling

### Edge Case: User Loses Access While Editing
**Scenario**: User is editing title when they are removed as collaborator

**Handling**:
- Server action checks authorization on save
- Returns authorization error
- Client displays toast error: "You do not have permission to edit this list"
- Component resets to non-editing state
- Next page refresh will show non-editable view

### Edge Case: Simultaneous Edits
**Scenario**: Two users edit title at the same time

**Handling**:
- Last write wins (no optimistic locking in this version)
- Both users see updated title after their save completes due to revalidatePath
- Document this limitation in code comments
- Note: First user's save succeeds, second user's save overwrites it

### Edge Case: User Types Title Too Long
**Scenario**: User types more than 255 characters

**Handling**:
- Character count shows in red: "256/255 characters"
- Validation error message appears: "Title cannot exceed 255 characters"
- Save button disabled
- User must delete characters to enable save
- Server validation prevents save if somehow submitted

### Edge Case: Empty or Whitespace-Only Title
**Scenario**: User clears input or enters only spaces

**Handling**:
- Client computes trimmed length
- If zero: validation error appears, save button disabled
- Error message: "Title cannot be empty"
- User must enter text to enable save
- Server validation prevents save if somehow submitted

### Edge Case: Network Failure During Save
**Scenario**: Request fails due to network issue

**Handling**:
- Try-catch in component catches error
- Toast error notification: "Failed to update list title"
- Component stays in edit mode so user can retry
- User can click Save again to retry

### Edge Case: Database Constraint Violation
**Scenario**: Unexpected database error (connection loss, constraint violation)

**Handling**:
- Catch database errors in server action try-catch
- Log error details server-side for debugging
- Throw user-friendly error message
- Toast notification: "Failed to update list title due to a database error"

### Edge Case: User Clicks Cancel
**Scenario**: User starts editing then clicks Cancel

**Handling**:
- Reset title state to original list.title
- Exit edit mode
- Clear any error messages
- No server call made

### Edge Case: User Not Authenticated
**Scenario**: Session expires or user not logged in

**Handling**:
- Middleware redirects to sign-in page before reaching component
- Component code assumes user exists if editable is true
- If user somehow undefined, editable will be false, showing static title

## Success Criteria
- Collaborators can successfully edit list titles with same UX as owners
- Authorization properly enforced - only owners and collaborators can edit
- Real-time validation feedback prevents invalid submissions
- Character counter provides clear guidance on title length
- Save button disabled when validation fails
- Changes immediately visible after save on both /lists and /lists/[listId] pages
- Toast notifications provide clear feedback on success/failure
- No regression in existing functionality
- Loading states prevent double-submission
- Error handling covers all edge cases gracefully
- Code follows project patterns for server actions and components
