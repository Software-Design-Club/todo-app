---
name: iterating-plans
description: "Iterates on existing implementation plans with research and surgical updates. Use when you say: 'update the plan', 'revise this plan', 'adjust the phases', 'incorporate feedback into the plan', 'update success criteria'."
---

# Iterating Plans

Update existing implementation plans based on user feedback with surgical precision.

## Getting Started

1. **If plan path AND feedback provided**: proceed immediately
2. **If only plan path provided**: read it and ask what changes to make
3. **If nothing provided**: ask for the plan path (hint: `ls -lt thoughts/shared/plans/ | head`)

## Workflow

### Step 1: Read and Understand

1. Read the existing plan file completely
2. Understand the current structure, phases, and scope
3. Parse what the user wants to add/modify/remove
4. Determine if changes require codebase research

### Step 2: Research If Needed

**Only research if changes require new technical understanding.** For simple adjustments, skip this step.

If research is needed:

1. Use the `Task` tool to spawn parallel investigation tasks with `finder` and `Read`
2. Load the `locating-thoughts` / `analyzing-thoughts` skills for historical context
3. Wait for all sub-tasks to complete

### Step 3: Confirm Understanding

Before making changes:

```
Based on your feedback, I understand you want to:
- [Change 1]
- [Change 2]

My research found:
- [Relevant constraint or pattern]

I plan to update the plan by:
1. [Specific modification]
2. [Another modification]

Does this align with your intent?
```

### Step 4: Update the Plan

1. Make focused, precise edits with edit_file — not wholesale rewrites
2. Maintain the existing structure unless explicitly changing it
3. Keep all file:line references accurate
4. If adding a phase, follow the existing pattern
5. If modifying scope, update "What We're NOT Doing"
6. Maintain the automated vs manual success criteria distinction

### Step 5: Commit and Present Changes

1. Run via Bash: `jj commit -m "plan: update [plan name]"` to commit the changes
2. Present the changes:

```
I've updated the plan at `thoughts/shared/plans/[filename].md`

Changes made:
- [Specific change 1]
- [Specific change 2]

Would you like any further adjustments?
```

## Guidelines

- **Be skeptical**: Don't blindly accept changes that conflict with existing phases — point out issues
- **Be surgical**: Precise edits, preserve good content, only research what's necessary
- **Be interactive**: Confirm understanding before editing, allow course corrections
- **No open questions**: If a change raises questions, ask immediately — don't update with unresolved items
- **Success criteria**: Always maintain the two-category structure (automated commands vs manual human testing)
