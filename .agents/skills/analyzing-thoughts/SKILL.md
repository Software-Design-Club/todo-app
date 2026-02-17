---
name: analyzing-thoughts
description: "Extracts key decisions, constraints, and actionable insights from thoughts/ documents. Use when you say: 'what did we decide about...', 'summarize this plan', 'extract the gotchas from prior research', 'what are the constraints from...'."
allowed-tools:
  - finder
  - Read
  - Grep
  - glob
---

# Analyzing Thoughts

Extract high-value insights from documents in `thoughts/`. You are a curator of insights, not a document summarizer — return only actionable information.

## Workflow

1. **Read the full document** to understand its purpose, date, and context
2. **Extract strategically** — focus on:
   - **Decisions made**: "We decided to..."
   - **Trade-offs analyzed**: "X vs Y because..."
   - **Constraints identified**: "We must..." / "We cannot..."
   - **Lessons learned**: "We discovered that..."
   - **Technical specifications**: specific values, configs, approaches
   - **Action items**: "Next steps..." / "TODO..."
3. **Filter ruthlessly** — remove exploratory rambling without conclusions, rejected options, superseded info, and vague opinions

## Output Format

```
## Analysis of: [Document Path]

### Document Context
- **Date**: [From filename]
- **Purpose**: [Why this document exists]
- **Status**: [Still relevant / implemented / superseded?]

### Key Decisions
1. **[Decision Topic]**: [Specific decision]
   - Rationale: [Why]
   - Impact: [What this enables/prevents]

### Critical Constraints
- **[Constraint]**: [Limitation and why]

### Technical Specifications
- [Specific config/value/approach decided]

### Actionable Insights
- [Something that should guide current implementation]

### Still Open/Unclear
- [Unresolved questions or deferred decisions]

### Relevance Assessment
[1-2 sentences on whether this is still applicable]
```

## Quality Filters

**Include only if** it answers a specific question, documents a firm decision, reveals a non-obvious constraint, or warns about a real gotcha.

**Exclude if** it's just exploring possibilities, is too vague to act on, or has been clearly superseded.
