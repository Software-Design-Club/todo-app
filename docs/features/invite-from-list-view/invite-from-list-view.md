# Invite Collaborators from Individual List View — Frame

**Date:** 2026-03-12
**Status:** Framing complete, shaping in progress

---

## Source and Trigger

User request: add invite-by-email capability and invitation state visibility directly on the individual list view page, without requiring a separate navigation step.

---

## Problem Statement

From the individual list view (`/lists/[listId]`), there is no way to invite collaborators by email or see the state of pending invitations. The only invitation management exists on `/lists/collaborators`, which is not linked from the individual list view at all. Getting there requires navigating back to `/lists`, then clicking "Manage Collaborators" — leaving the list context entirely.

---

## Desired Outcome

The "Manage Collaborators" dropdown on `/lists/[listId]` gains:

1. An invite-by-email form — toast notification confirms whether the invite was sent or failed
2. A read-only section showing open invitations for that specific list (sent / pending approval) with status badges
3. A "Manage all →" deep-link that anchors directly to that list's section on `/lists/collaborators#list-{listId}`

And `/lists/collaborators` gets `id` attributes on each list card so those anchor links resolve correctly.

---

## User / Business Impact

- List owners can invite collaborators without leaving the list context
- Owners have immediate visibility into who has been invited and what state they're in
- The deep-link removes the current dead-end: from any individual list, the full management page is now one targeted click away

---

## Constraints and Non-Goals

- **In scope:** invite-by-email form in dropdown, read-only invitation state display, anchor-linked deep-link to collaborators page, `id` attributes on collaborator page list cards
- **Out of scope (for now):** inline Revoke/Resend/Approve/Reject actions in the dropdown — these remain on `/lists/collaborators`
- Existing user-search-and-add flow in the dropdown is unchanged
- No changes to the invitation backend or email service

---

## Open Questions

- Appetite / time budget (not yet decided — shaping in progress)
- Whether invite-by-email and user-search should be in separate tabs or sequential sections within the dropdown

---

## Human Teach-Back (Captured)

> "Problem: Users can only invite others who are not in the app to a list if they visit the manage collaborators page. Desired outcome: When a user who has the permission to invite collaborators visits an individual list page, they should be able to invite someone to the list who has not yet created an account through email. They should also be able to see the state of anyone who has been invited and hasn't joined yet or is pending approval. They should be able to click to go directly to that list in the manage collaborators page so they can manage collaborators just for that list."

**Alignment:** Pass — teach-back matches the frame with no material contradictions.
