---
name: create-plan
description: Create a detailed implementation plan through interactive research, file reading, and iteration. Use when the user asks for a plan, spec, or roadmap, especially tied to a ticket, task file, or feature request.
---

# Create Plan

## Overview
Produce a clear, phased implementation plan grounded in codebase reality and validated assumptions.

## Workflow
1. If no parameters are provided, ask for the task/ticket description and relevant context. If a file path is provided, read it fully and begin.
2. Read all mentioned files fully before asking questions or delegating research.
3. Research in parallel when helpful: locate relevant files, analyze current behavior, find existing patterns, and check related thoughts docs.
4. Read all files identified by research. Verify understanding against the codebase.
5. Present a concise summary plus focused questions you cannot answer from code alone.
6. Present design options if multiple approaches are viable, with pros/cons.
7. Propose a plan structure and confirm it before writing full details.
8. Write the plan to `thoughts/shared/plans/YYYY-MM-DD-<ticket?>-<description>.md` using a clear template.

## Plan Template Guidance
Include these sections:
- Overview
- Current State Analysis
- Desired End State (with how to verify)
- Key Discoveries (file:line references)
- Implementation Phases (sequenced, actionable)
- Success Criteria (automated vs manual)
- What We Are Not Doing (scope control)

## Quality Rules
- Be skeptical: verify requirements against code.
- Ask only questions that code cannot answer.
- Use file:line references for discoveries and constraints.
- Keep phases measurable and testable.
