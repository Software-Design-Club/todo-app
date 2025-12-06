# Spec Requirements: List Visibility Controls

## Initial Description
Add ability for list owners to control whether their lists are private (default) or public. Public lists can be viewed by anyone with the link, while private lists remain accessible only to collaborators.

## Requirements Discussion

### First Round Questions

**Q1: Default visibility for new lists**
**Answer:** Private by default

**Q2: Visibility control location**
**Answer:** Make the visibility control a toggle next to the Manage Collaborators section that can only be toggled by the list owner

**Q3: Public list access requirements**
**Answer:** Anyone with a link should be able to see a public list, no auth needed

**Q4: Collaborators and visibility relationship**
**Answer:** Visibility is independent of collaborators so their status should not change based on the visibility set by the list owner

**Q5: Database schema approach**
**Answer:** enum column with "private" and "public" to start

**Q6: Authorization updates needed**
**Answer:**
- The getList() function currently has no authorization built in, it should be updated to check if the currently logged in user is authorized to get the list if it's a private list, but just return the list if the list is public
- For getTodos, it should check if the list is public or private, if private it should check if the currently logged in user is authorized to view the list

**Q7: UI indicators for visibility status**
**Answer:** Lock icon for private list and globe icon for public list

### Follow-up Questions - Edge Cases

**Follow-up 1: Viewing permissions for unauthenticated users**
**Answer:** Unauthenticated users should be able to view the full list but not be able to edit anything about it

**Follow-up 2: Public list discoverability**
**Answer:** Public lists should be accessed through a link (not discoverable through search/browse)

**Follow-up 3: Interaction handling for non-collaborators**
**Answer:** When an unauthenticated user sees a public list, no interaction should be possible. This also applies to authenticated users viewing a public list that they are not a collaborator on

### Existing Code to Reference

**Similar Features Identified:**

**Schema Pattern:**
- Path: Database schema file
- Reference: `export const CollaboratorRoleEnum = pgEnum("collaborator_role", ["owner", "collaborator"]);`
- Pattern: Follow similar enum pattern for visibility

**UI Component:**
- Component: shadcn switch component
- Reference: https://ui.shadcn.com/docs/components/switch
- Usage: For visibility toggle control

**Permissions Logic:**
- Path: `app/lists/_actions/permissions.ts`
- Purpose: Reference for authorization patterns and permission checking logic

## Visual Assets

### Files Provided:
- `Screenshot 2025-11-09 at 1.10.57 PM.png`: Shadcn Switch component example showing "Airplane Mode" toggle with Label and Switch components imported from @/components/ui. Demonstrates the toggle pattern to use for visibility control.

### Visual Insights:
- High-fidelity component example
- Shows clean toggle switch with label pattern
- Demonstrates proper component imports and structure
- Uses flex layout for switch and label alignment
- Simple, accessible toggle implementation

## Requirements Summary

### Functional Requirements

**Core Functionality:**
- List owners can toggle list visibility between private and public
- Private lists (default) are only accessible to collaborators
- Public lists can be viewed by anyone with the link
- Visibility setting is independent of collaborator relationships

**User Actions:**
- List owner can toggle visibility via switch control next to Manage Collaborators section
- Unauthenticated users can view public lists (read-only)
- Authenticated non-collaborators can view public lists (read-only)
- Collaborators maintain full permissions regardless of visibility setting

**Data Management:**
- Database stores visibility as enum: "private" | "public"
- Default visibility: private
- Visibility is a property of the list, not dependent on collaborators

### Authorization Logic Updates

**getList() Function:**
- Current state: No authorization built in
- Required update:
  - If list is public: return list without auth check
  - If list is private: verify currently logged in user is authorized (is a collaborator)

**getTodos() Function:**
- Required update:
  - Check list visibility status
  - If public: return todos without auth check
  - If private: verify currently logged in user is authorized to view the list

### UI/UX Requirements

**Visibility Control:**
- Location: Next to Manage Collaborators section
- Component: shadcn Switch component
- Access: Only list owners can toggle
- Pattern: Follow Switch/Label pattern from shadcn reference

**Visual Indicators:**
- Private lists: Lock icon
- Public lists: Globe icon
- Display visibility status clearly to users

**Interaction States:**
- Unauthenticated users on public lists: View-only, no edit/interaction capabilities
- Authenticated non-collaborators on public lists: View-only, no edit/interaction capabilities
- Collaborators: Full permissions (unchanged by visibility setting)
- List owners: Full permissions including visibility toggle control

### Reusability Opportunities

**Schema Pattern:**
- Follow existing `CollaboratorRoleEnum` pattern for new visibility enum
- Use pgEnum for type-safe database enum

**Permission Checking:**
- Reference `app/lists/_actions/permissions.ts` for authorization patterns
- Apply similar permission checking logic for visibility-based access

**UI Components:**
- Use shadcn Switch component (already in codebase)
- Follow established component import patterns

### Scope Boundaries

**In Scope:**
- Add visibility enum to database schema (private/public)
- Create visibility toggle UI for list owners
- Update getList() authorization logic
- Update getTodos() authorization logic
- Add visual indicators (lock/globe icons)
- Enable read-only access for public lists
- Block all interactions for non-collaborators on public lists

**Out of Scope:**
- Public list discovery/search functionality (access is link-only)
- Changing collaborator permissions based on visibility
- Additional visibility levels beyond private/public
- Public list analytics or tracking
- Sharing functionality beyond link access

### Technical Considerations

**Database Schema:**
- Create enum type for visibility: "private" | "public"
- Add visibility column to lists table with default value "private"
- Follow pattern: `export const ListVisibilityEnum = pgEnum("list_visibility", ["private", "public"]);`

**Authorization Layer:**
- Modify getList() to check visibility before enforcing auth
- Modify getTodos() to check list visibility before enforcing auth
- Maintain separation between visibility check and collaborator check

**Edge Cases:**
- Unauthenticated access to public lists must be fully read-only
- Authenticated non-collaborators must also have read-only access to public lists
- Visibility toggle only appears for list owners
- Collaborator permissions remain unchanged regardless of visibility

**Integration Points:**
- Visibility control integrates with existing Manage Collaborators section
- Permission system must distinguish between visibility-based access and collaborator-based access
- UI must conditionally render edit/interaction controls based on user role and list visibility