---
name: implementing-plans
description: "Implements approved technical plans from thoughts/shared/plans/ phase by phase with verification. Use when you say: 'implement this plan', 'execute the plan', 'build from this plan', 'implement phase 1', 'follow the plan step-by-step'."
---

# Implementing Plans

Implement approved technical plans from `thoughts/shared/plans/` with phase-by-phase verification.

## Getting Started

When given a plan path:

1. Read the plan completely — check for existing checkmarks (`- [x]`)
2. Read the original ticket and all files mentioned in the plan
3. Read files fully — never partially
4. Start implementing from the first unchecked phase

If no plan path provided, ask for one.

## Implementation Philosophy

- Follow the plan's intent while adapting to what you find in the codebase
- Implement each phase fully before moving to the next
- Verify your work makes sense in the broader context
- Update checkboxes in the plan as you complete sections

## When Things Don't Match

If the codebase doesn't match what the plan expects:

```
Issue in Phase [N]:
Expected: [what the plan says]
Found: [actual situation]
Why this matters: [explanation]

How should I proceed?
```

## Verification After Each Phase

0. **If the phase has no automated verification steps** (typecheck, lint, tests, etc.), **STOP** and ask the human for explicit permission before implementing that phase. Do not proceed without approval.
1. Run the automated success criteria checks (typecheck, lint, tests)
2. Fix any issues before proceeding
3. Check off completed items in the plan file using edit_file
4. **If the plan includes manual verification steps for this phase**, pause for human verification:

```
Phase [N] Complete - Ready for Manual Verification

Automated verification passed:
- [List automated checks that passed]

Please perform the manual verification steps listed in the plan:
- [List manual verification items from the plan]

Let me know when manual testing is complete so I can proceed to Phase [N+1].
```

If instructed to execute multiple phases consecutively, skip the pause until the last phase.

Do NOT check off manual testing items until confirmed by the user.

5. **If the plan has no manual verification for this phase**, proceed directly to the next phase after automated checks pass.

After completing each phase, run via Bash: `jj commit -m "implement: [plan name] phase [N]: One sentence summary of changes"` to track progress.

## Resuming Work

If the plan has existing checkmarks:

- Trust that completed work is done
- Pick up from the first unchecked item
- Verify previous work only if something seems off

## Guidelines

- You're implementing a solution, not just checking boxes — keep the end goal in mind
- Use the `Task` tool sparingly — mainly for targeted debugging or exploring unfamiliar code
- Read and understand all relevant code before making changes
- Maintain forward momentum
