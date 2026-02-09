# Product Development Plan

## Overview

This document tracks our development progress using an epic/ticket structure. **Epics** are high-level roadmap items representing major features. **Tickets** are individual implementation tasks, bugs, and chores that roll up into epics or stand alone.

**Legend:**
- `[x]` = Completed
- `[~]` = In Progress
- `[ ]` = Pending
- `[?]` = Uncertain/Exploratory

---

## Completed Epics

### 1. List Title Editing for Collaborators ✅
Enable collaborators to edit the title of lists they have access to.

**Related Tickets:**
- [x] User can edit the title of a list they are a collaborator on
- [x] Visually tell whether the user is a collaborator or a creator of the list when on list page
- [x] Separate the authorization for editing lists from authorization for editing collaborators on a list

### 2. List Visibility Controls ✅
Add public/private visibility setting to lists with proper authorization.

**Related Tickets:**
- [x] User can change lists visibility. Private lists are only visible to the creator and collaborators. Public lists are visible to everyone.
- [x] Add list authorization. Users can only edit list they create or are a collaborator on.
- [x] Add opaque types for list and user ids
- [x] Add role to ListCollaborator table
- [x] Backfill ListCollaborator table with roles and ids of list creators
- [x] Add function to check if user is authorized to edit list using the opaque types
- [x] Figure out how to deal with the fact that session.user.id is not user.id from the db

### 3. Public List Link Sharing ✅
Generate shareable links for public lists.

**Related Tickets:**
- [ ] ~~Creator/Collaborator can share a link to a list if its public~~
  - Note: Roadmap marked as completed but ticket pending - needs verification

### 4. List Archival and Deletion ✅
Allow list owners to archive or delete lists.

**Related Tickets:**
- [ ] User can delete/archive a list

---

## In Progress Epics

### 5. Email Invitation System [~]
Send email invitations when users are added as collaborators.

**Related Tickets:**
- [ ] User can invite someone who is not signed up to the app to a list - Send email to invitee
- [ ] On branches deployed to Vercel, sign in does not work because the redirect_uri does not match up with the redirect_ui registered in

### 6. Task Assignment [~]
Enable list owners and collaborators to assign specific tasks to collaborators.

**Related Tickets:**
- [ ] Creator/Collaborator can assign todos to collaborators on a list
- [?] Creator can move todos to a different list

### 7. Email Notifications for Task Changes [~]
Send email notifications to assigned users when tasks change.

**Related Tickets:**
- [?] Collaborator can be notified when they are invited to a list in the app and in their email
- [?] User can be notified when a todo is assigned to them

---

## Pending Epics

### 8. In-App Notification Center
Create an in-app notification panel to view history of invitations, assignments, and updates.

**Related Tickets:**
- (No tickets yet - new epic)

---

## Core System Epics (Completed)

### Authentication & Authorization ✅
Foundation for user management and access control.

**Related Tickets:**
- [x] Allow users to update state on Todos table
- [x] Make list read only unless user is signed in
- [x] 404 for missing list ID
- [x] User can add todo
- [x] User can edit todo
- [x] User "delete" todo
- [x] Where to put core business logic?
- [x] Get todos with query client using React Query
- [x] User can create a list
- [x] User can invite collaborators to a list
- [x] User can see collaborators on a list
- [x] User can remove collaborators from a list
- [x] Investigate why some users are not able to see their own lists after creating them on the home page and list pages
- [x] Make sure that owner cannot be removed as a collaborator on a list
- [x] User can see lists they are a collaborator on their lists view

### Data Architecture ✅
Database schema, queries, and state management.

**Related Tickets:**
- [x] All core data structure work completed as part of other epics

---

## Standalone Tickets (Not Part of Epics)

These are maintenance tasks, bugs, and improvements that don't fit into feature epics:

- [ ] Make it clear whether the user is a collaborator or a creator anytime they are viewing list information.
- [ ] Clean up components/ui and ui/ folder

---

## Dependencies & Prerequisites

1. **Email Invitation System** must be completed before **Email Notifications for Task Changes**
2. **Task Assignment** must be completed before **In-App Notification Center** (for task-related notifications)
3. **List Visibility Controls** was prerequisite for **Public List Link Sharing**

---

## Notes

### From Development Log

**On React Query vs Server Actions:**
- Stop using React Query to create list on home page
- Server actions and revalidatePath work fine

**On Client-Side Sorting (2/9/2025):**
- Client side sorting does not keep persist after updating the data
- Next.js is refreshing the page

**On Event Handling (2/2/2025):**
- Onblur is not a good event to use to close the edit mode
- It seems to prevent the form from being submitted

**On Business Logic Organization:**
- Decided to split the business by route/feature for now
- Will see if we need to change it later

**On Server Actions and Client Updates:**
- Trade off between using server actions and client side updates
- Server actions did not update the client reliably
- Tried revalidating the path, but it did not work
- Want to investigate if there is some trick/config to make it work

### Technical Debt

- Session.user.id is not the same as user.id from the db
- Type errors in manage-collaborators.tsx and list.tsx (need verification)
- Some users not able to see their own lists after creating them - **RESOLVED**

### Design Decisions

- Called `notFound()` in `getListWithTodos` for missing list ID
- Pattern may lead to always responding with 404 when db returns null
- May want alternative for custom 404 pages at specific routes

---

## Sprint Planning

**Current Focus:**
1. Complete Email Invitation System
2. Verify Public List Link Sharing completion status
3. Complete List Archival/Deletion
4. Begin Task Assignment implementation

**Next Up:**
- Explore different ways to authorize users before common use cases(edit todo, update list, invite collaborators). Right now it is function that act as guards in the top of actions but those functions make DB calls(could this be avoided? Without adding something like redis or could it in some kind of service/workflow type service that checks it once at the top)
- Fix depraction warnings
  - The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.
  - Next Lint deprecration
  - Using '@vercel/postgres' driver for database querying Warning  '@vercel/postgres' can only connect to remote Neon/Vercel 
- Email Notifications for Task Changes
- In-App Notification Center
- Cleanup tasks (UI folder organization, collaborator/creator visibility)
