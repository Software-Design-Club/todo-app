---
name: implement-plan
description: Implement an approved plan from thoughts/shared/plans, phase by phase, with verification and plan checkbox updates. Use when the user asks to execute a plan document.
---

# Implement Plan

## Overview
Execute a plan reliably by following phases, verifying results, and updating the plan file as work completes.

## Workflow
1. If no plan path is provided, ask for one.
2. Read the plan and all referenced files fully.
3. Create a todo list and implement phase by phase.
4. After each phase, run automated checks from the plan and fix issues before continuing.
5. Update plan checkboxes as sections complete.
6. Pause for manual verification when required; do not mark manual steps complete without user confirmation.

## Mismatch Handling
If the plan conflicts with reality:
- Stop and describe the mismatch (expected vs found, why it matters).
- Ask how to proceed before deviating.

## Verification Format
After a phase completes:
- List automated checks that passed.
- List manual verification steps to run.
- Wait for user confirmation before continuing.
