---
name: creating-plans
description: "Creates detailed implementation plans through interactive research and iteration. Use when you say: 'plan this feature', 'create a plan', 'write an implementation spec', 'design doc for...', 'technical spec', 'plan the rollout for...'."
---

# Creating Plans

Create detailed implementation plans through interactive, iterative research. Be skeptical, thorough, and collaborative.

## Getting Started

1. **If a file path or ticket was provided**: read it fully and begin research
2. **If no input provided**, ask:
   - The task/ticket description or reference
   - Any relevant context, constraints, or requirements
   - Links to related research or previous implementations

## Workflow

### Step 1: Context Gathering

1. **Read all mentioned files fully** (tickets, research docs, related plans)
2. **Research the codebase in parallel** using the `Task` tool:
   - Use `finder` to locate all files related to the task
   - Use `Read` to understand current implementations
   - Load the `locating-thoughts` skill to find existing thoughts documents
   - Check `plan/backlog.md` for roadmap context (if it exists)
3. **Read all files identified by research** into main context
4. **Present informed understanding** with file:line references and ask only questions that research couldn't answer

### Step 2: Research & Discovery

After getting clarifications:

1. If the user corrects a misunderstanding, **verify with new research** — don't blindly accept
2. Use the `Task` tool to spawn parallel investigation tasks:
   - Find similar features and patterns to model after
   - Understand integration points and dependencies
   - Extract insights from relevant thoughts documents using the `analyzing-thoughts` skill
3. **Wait for ALL sub-tasks to complete** before proceeding
4. Present findings, design options with pros/cons, and open questions

### Step 3: Plan Structure

Present the proposed phase structure and get feedback before writing details:

```
## Implementation Phases:
1. [Phase name] - [what it accomplishes]
2. [Phase name] - [what it accomplishes]
```

### Step 4: Write the Plan

Save to `thoughts/shared/plans/YYYY-MM-DD-description.md` (add `ENG-XXXX` if ticket exists).

Use this template:

````markdown
# [Feature/Task Name] Implementation Plan

## Overview
[Brief description of what we're implementing and why]

## Current State Analysis
[What exists now, what's missing, key constraints discovered]

## Desired End State
[Specification of the desired end state and how to verify it]

### Key Discoveries:
- [Important finding with file:line reference]

## What We're NOT Doing
[Explicitly list out-of-scope items]

## Implementation Approach
[High-level strategy and reasoning]

## Phase 1: [Descriptive Name]

### Overview
[What this phase accomplishes]

### Changes Required:

#### 1. [Component/File Group]
**File**: `path/to/file.ext`
**Changes**: [Summary]

```[language]
// Specific code to add/modify
```

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Tests pass: `npm test`

#### Manual Verification:
- [ ] Feature works as expected in UI
- [ ] No regressions in related features

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to the next phase.

---

## Phase 2: [Descriptive Name]
[Similar structure...]

---

## Testing Strategy

### Unit Tests:
- [What to test]

### Manual Testing Steps:
1. [Specific step to verify]

## References
- Original ticket: `thoughts/shared/plans/...`
- Related research: `thoughts/shared/research/...`
- Similar implementation: `[file:line]`
````

### Step 5: Commit and Review

1. Run via Bash: `jj commit -m "plan: [brief plan description]"` to commit the newly created plan
2. Present the draft plan location and ask for review
3. Iterate based on feedback — adjust phases, scope, criteria
4. After each round of changes, run via Bash: `jj commit -m "plan: update [plan name]"` again
5. Continue refining until satisfied

## Guidelines

- **Be skeptical**: Question vague requirements, verify with code, don't assume
- **Be interactive**: Get buy-in at each step, don't write the full plan in one shot
- **Be thorough**: Include file paths, line numbers, measurable success criteria
- **Be practical**: Incremental testable changes, consider edge cases
- **No open questions in final plan**: Research or ask for clarification immediately — every decision must be made before finalizing
- **Separate success criteria**: Always distinguish automated (commands to run) from manual (human testing)
