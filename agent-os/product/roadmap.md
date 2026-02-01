# Product Roadmap

## Current State

The application currently has:
- User authentication via GitHub OAuth (NextAuth)
- Todo list creation and management
- Task CRUD operations (create, read, update, delete)
- Task status tracking (not started, in progress, done)
- List collaboration with role-based permissions (owner/collaborator)
- Collaborator management (add, view, remove)
- Authorization controls for list editing and collaborator management
- Protected owner permissions (owners cannot be removed from their lists)
- Multi-list workspace (users see lists they own and lists they collaborate on)

## Development Roadmap

1. [x] List Title Editing for Collaborators - Enable collaborators to edit the title of lists they have access to, not just owners. Update authorization checks and UI components to allow collaborators to modify list titles. `XS`

2. [x] List Visibility Controls - Add public/private visibility setting to lists. Private lists are only accessible to the creator and invited collaborators. Public lists can be viewed by anyone with the link. Include database schema updates, new UI controls on list settings, and authorization middleware updates. `S`

3. [x] Public List Link Sharing - Generate shareable links for public lists that allow anyone to view (but not edit) the list without being added as a collaborator. Implement link generation UI. `S`

4. [x] List Archival and Deletion - Allow list owners to archive lists (hide from main view but keep data) or permanently delete lists and all associated tasks. Add confirmation dialogs and update list retrieval queries to exclude archived lists by default. `S`

5. [ ] Email Invitation System - Send email invitations when users are added as collaborators to a list, including a link to sign up/sign in and access the shared list. Integrate with Resend email service (already in dependencies), create email templates, and handle invitation token generation and validation. `M`

6. [ ] Task Assignment - Enable list owners and collaborators to assign specific tasks to collaborators on shared lists. Add assignee field to tasks table, update task UI to show and allow assignment selection, and include assignment in task details. `M`

7. [ ] Email Notifications for Task Changes - Send email notifications to assigned users when tasks they're involved in are created, updated, or completed. Build notification event system, create email templates for different task events, and implement notification preferences. `M`

8. [ ] In-App Notification Center - Create an in-app notification panel to view history of list invitations, task assignments, and task updates. Store notifications in database, build UI component for notification dropdown, and mark notifications as read. `L`

> Notes
> - Items are ordered by dependencies and incremental value delivery
> - Email invitation system (item 5) is a prerequisite for email notifications (item 7)
> - Task assignment (item 6) enables more advanced collaboration and notification features
> - Each item represents a complete, testable feature from frontend to backend
