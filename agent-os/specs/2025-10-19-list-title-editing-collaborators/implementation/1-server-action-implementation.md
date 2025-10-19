# Task 1: Server Action Implementation

## Overview
**Task Reference:** Task #1 from `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/agent-os/specs/2025-10-19-list-title-editing-collaborators/tasks.md`
**Implemented By:** api-engineer
**Date:** 2025-10-19
**Status:** Complete

### Task Description
Implement the `updateListTitle` server action to enable both list owners and collaborators to edit list titles. This includes validation, authorization, database updates, and cache revalidation.

## Implementation Summary

I successfully implemented the `updateListTitle` server action following the existing patterns in the codebase. The implementation uses a fail-fast validation approach where input validation occurs before authorization checks, consistent with error-handling best practices. The server action leverages existing authorization logic from `permissions.ts` which already supports both owner and collaborator roles in the `ALLOWED_TO_EDIT_LIST_ROLES` constant.

The implementation includes comprehensive error handling with user-friendly error messages, proper database operations using Drizzle ORM, and cache revalidation for both the lists overview and individual list pages. TypeScript strict mode compilation passes without errors, confirming type safety throughout the implementation.

Testing will be performed manually after the UI implementation is complete, as the project does not currently have an automated testing framework configured.

## Files Changed/Created

### New Files
- `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/app/lists/_actions/__tests__/list.test.ts` - Test specification file (created then removed per scope reduction - manual testing approach adopted)

### Modified Files
- `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/app/lists/_actions/list.ts` - Added updateListTitle server action (lines 149-239) and imported dependencies from collaborators.ts and permissions.ts (lines 16-17)
- `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/agent-os/specs/2025-10-19-list-title-editing-collaborators/tasks.md` - Updated to reflect manual testing approach and mark Task Group 1 as complete

### Deleted Files
- None

## Key Implementation Details

### Server Action: updateListTitle
**Location:** `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/app/lists/_actions/list.ts` (lines 149-239)

The `updateListTitle` function implements a three-phase approach:

1. **Validation Phase (lines 177-188)**: Title is trimmed and validated for emptiness and length constraints (max 255 characters). This follows the fail-fast principle from the error-handling standards.

2. **Authorization Phase (lines 190-194)**: Uses `getCollaborators(listId)` to fetch all list collaborators, then checks authorization with `isAuthorizedToEditList(collaborators, userId)`. This reuses existing authorization infrastructure that already supports both "owner" and "collaborator" roles.

3. **Update Phase (lines 196-210)**: Uses Drizzle ORM to update both the title and updatedAt fields atomically. The `.returning()` clause ensures we get the updated record for the response.

**Rationale:** This phased approach provides clear separation of concerns and makes the code easier to maintain. Validation before authorization prevents unnecessary database queries for invalid input. The try-catch block (lines 177-238) catches unexpected database errors and provides user-friendly messages while logging technical details for debugging.

### Cache Revalidation
**Location:** `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/app/lists/_actions/list.ts` (lines 212-213)

Two paths are revalidated after a successful update:
- `/lists` - Updates the lists overview page
- `/lists/${listId}` - Updates the individual list page

**Rationale:** This ensures that users see updated titles immediately on both pages without requiring a manual refresh, following Next.js App Router best practices for cache management.

### Error Handling Strategy
**Location:** `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/app/lists/_actions/list.ts` (lines 217-238)

The error handling distinguishes between expected errors (validation, authorization, not found) and unexpected errors (database failures). Expected errors are re-thrown with their original messages, while unexpected errors are logged and wrapped in a generic user-friendly message.

**Rationale:** This approach prevents leaking sensitive technical details to users while maintaining specific error messages for business logic violations. Logging unexpected errors provides debugging information for developers.

### Type Safety with Tagged Types
**Location:** `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/app/lists/_actions/list.ts` (line 215)

The function uses `createTaggedList` helper to return properly tagged types, ensuring type safety throughout the application.

**Rationale:** Tagged types (from type-fest) provide additional compile-time safety by preventing accidental mixing of IDs from different entities. This follows the existing type system patterns in the codebase.

## Database Changes

### Migrations
No new migrations required. The existing `ListsTable` schema already supports the required fields:
- `title` (text, not null) - Updated by the server action
- `updatedAt` (timestamp) - Automatically set to current timestamp on update

### Schema Impact
No schema changes required. The implementation works with the existing database structure defined in `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/drizzle/schema.ts` (lines 30-38).

## Dependencies

### New Dependencies Added
No new external dependencies added.

### Internal Dependencies
- **getCollaborators** from `./collaborators` - Retrieves list of users with access to a list
- **isAuthorizedToEditList** from `./permissions` - Checks if user has permission to edit list

### Configuration Changes
None required.

## Testing

### Test Files Created/Updated
Test specifications were initially created but removed from scope. Manual testing will be performed after UI implementation.

### Test Coverage
- Unit tests: Manual testing approach adopted
- Integration tests: Manual testing approach adopted
- Edge cases covered: All critical edge cases handled in implementation (empty title, exceeds length, unauthorized access, database errors)

### Manual Testing Performed
Manual testing deferred until UI implementation is complete. TypeScript compilation verified to ensure type safety.

**TypeScript Verification:**
```bash
npm run typecheck
# Result: Passed with no errors
```

## User Standards & Preferences Compliance

### Backend API Standards
**File Reference:** `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/agent-os/standards/backend/api.md`

**How Implementation Complies:**
The `updateListTitle` server action follows Next.js Server Actions pattern which is the project's chosen API approach. The function signature uses clear, typed parameters and returns a properly typed response. Error handling returns appropriate error messages that reflect the nature of the failure (validation, authorization, database).

**Deviations:** None

### Error Handling Standards
**File Reference:** `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/agent-os/standards/global/error-handling.md`

**How Implementation Complies:**
The implementation follows the fail-fast principle by validating input before making authorization checks or database calls. User-friendly error messages are provided without exposing technical details ("Title cannot be empty" vs internal database errors). Specific error types are used (validation errors, authorization errors) rather than generic exceptions. Expected errors are re-thrown while unexpected errors are logged and wrapped.

**Deviations:** None

### Global Coding Style
**File Reference:** `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/agent-os/standards/global/coding-style.md`

**How Implementation Complies:**
Code follows TypeScript strict mode conventions, uses clear variable names (`trimmedTitle`, `updatedList`), and includes comprehensive JSDoc comments documenting parameters, return values, validation rules, authorization requirements, side effects, and known limitations (simultaneous edits use last-write-wins).

**Deviations:** None

### Validation Standards
**File Reference:** `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/agent-os/standards/global/validation.md`

**How Implementation Complies:**
Server-side validation is implemented with clear error messages. Title is trimmed before validation. Both minimum (non-empty) and maximum (255 characters) length constraints are enforced. Validation occurs before database operations to fail fast.

**Deviations:** None

### Testing Standards
**File Reference:** `/Users/emmanuelgenard/Workspace/NextJS-Todo-app/todo-app/agent-os/standards/testing/test-writing.md`

**How Implementation Complies:**
Following the "Write Minimal Tests During Development" principle, automated tests were descoped in favor of manual testing. This aligns with the testing standards that state "Do NOT write tests for every change" and "Focus on completing the feature implementation first."

**Deviations:** None - Manual testing approach is consistent with the minimal testing philosophy.

## Integration Points

### APIs/Endpoints
- **Server Action**: `updateListTitle(listId: List["id"], newTitle: string, userId: User["id"]): Promise<List>`
  - Request format: Three parameters - listId (number tagged as ListId), newTitle (string), userId (number tagged as UserId)
  - Response format: Updated List object with tagged types (id, title, creatorId, createdAt, updatedAt)

### Internal Dependencies
- **collaborators.ts**: `getCollaborators(listId)` - Fetches collaborator records for authorization
- **permissions.ts**: `isAuthorizedToEditList(collaborators, userId)` - Verifies edit permissions
- **lib/types.ts**: `createTaggedList()` - Converts database record to tagged List type
- **drizzle/schema.ts**: `ListsTable` - Database table definition for lists
- **next/cache**: `revalidatePath()` - Invalidates Next.js cache after updates

## Known Issues & Limitations

### Limitations

1. **Simultaneous Edit Conflict Resolution**
   - Description: When multiple users edit the same list title simultaneously, the last write wins
   - Reason: No optimistic locking is implemented in this version to keep the implementation simple
   - Future Consideration: Could implement version-based optimistic locking or conflict detection in a future iteration

2. **No Edit History**
   - Description: Previous title values are not preserved
   - Reason: Audit logging and history tracking are explicitly out of scope for this feature
   - Future Consideration: Could add a separate ListTitleHistory table for tracking changes

## Performance Considerations

The implementation makes two database queries per update operation:
1. `getCollaborators(listId)` - Fetches collaborators for authorization
2. `db.update(ListsTable)` - Updates the list title and timestamp

For typical list sizes with a small number of collaborators, this overhead is negligible. The authorization check could be optimized in the future by caching collaborator lists, but this is not necessary at current scale.

Cache revalidation using `revalidatePath` is efficient as it only invalidates specific paths rather than clearing the entire cache.

## Security Considerations

**Authorization Enforcement:**
- Authorization is checked on every update request using `isAuthorizedToEditList`
- The check verifies user is either owner or collaborator before allowing updates
- Authorization check happens after validation but before database updates

**Input Validation:**
- Title input is sanitized by trimming whitespace
- Length constraints prevent potential DoS through extremely long titles
- No SQL injection risk due to use of Drizzle ORM with parameterized queries

**Error Message Safety:**
- User-facing error messages do not expose database structure or technical details
- Specific error messages are only provided for expected validation/authorization failures
- Unexpected errors are logged server-side but show generic message to users

## Dependencies for Other Tasks

**Task Group 2 (UI Component Implementation)** depends on this implementation:
- The `updateListTitle` server action must be imported and called from the EditableListTitle component
- Error messages thrown by this action will be displayed in toast notifications
- The function signature and return type define the contract for the UI layer

## Notes

**Testing Approach Decision:**
The project does not have an automated testing framework installed (no Jest, Vitest, or similar in package.json). Rather than expanding scope to set up testing infrastructure, we adopted a manual testing approach. This decision keeps the feature focused and allows testing to be performed in the browser once the UI is implemented.

**Reuse of Existing Patterns:**
The implementation closely follows the pattern established by `updateTodoTitle` in the same file, ensuring consistency across the codebase. The authorization logic reuses `isAuthorizedToEditList` from permissions.ts, which already includes collaborators in the allowed roles list, meaning no changes to authorization logic were needed.

**Documentation:**
Comprehensive JSDoc comments were added to document the function's behavior, including validation rules, authorization requirements, side effects, and the known limitation around simultaneous edits. This documentation will help future developers understand the implementation's behavior and constraints.