# Frame: Unify Invite Flow

**Stage:** 1 — Framing
**Date:** 2026-03-12
**Status:** Complete (teach-back passed)

---

## Source and Trigger

Backlog ticket under Epic 5 (Email Invitation System): the existing "search users and add directly" path bypasses the invitation workflow entirely.

## Problem Statement

When a list owner searches for an existing app user and adds them as a collaborator, the system silently inserts them into `list_collaborators` with no email, no notification, and no opportunity for the invitee to consent. The invitee is simply assigned to a list they may not know about. Meanwhile, the email invitation workflow — which notifies, tracks, and requires acceptance — only triggers when inviting someone without an account.

## Desired Outcome

All collaborator additions route through the invitation workflow, regardless of whether the invitee already has an account. Searching for and selecting an existing user sends them an invitation email just like typing their email directly would. The invitee must accept before being added to `list_collaborators`.

## User and Business Impact

- Invitees are notified and consent to every list they're added to
- No functional difference between the two invite paths from the owner's perspective — both work the same way
- Owners can safely use either path without needing to know whether the invitee has an account

## Constraints and Non-Goals

- The invitation workflow itself (email sending, token handling, acceptance, pending approval) does not change
- The two UI affordances (search panel and email form) can remain — their backend behavior is unified, not their visual presentation
- No new email templates or invitation states needed

## Open Questions

- Should search results exclude users who already have an open invitation for this list (in addition to existing collaborators)? *(likely yes)*
- Should there be a migration or cleanup for users directly added before this change? *(out of scope)*

## Human Teach-Back (Captured)

> "Users were added as collaborators to lists without being notified or given a chance to accept/reject. After: The users receive an email notifying them of this change so they can decide whether or not to join a list."

**Alignment verdict:** Pass.
