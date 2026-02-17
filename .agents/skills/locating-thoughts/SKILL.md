---
name: locating-thoughts
description: "Finds relevant documents in thoughts/ (plans, research, decisions). Use when you say: 'do we already have a plan for...', 'search thoughts for...', 'find prior decisions about...', 'look for previous research or design notes'."
allowed-tools:
  - finder
  - Grep
  - glob
  - Read
---

# Locating Thoughts

Find and categorize documents in the `thoughts/` directory without deep analysis of their contents.

## Directory Structure

```
thoughts/
└── shared/
    ├── research/    # Research documents (dated: YYYY-MM-DD-topic.md)
    └── plans/       # Implementation plans (dated: YYYY-MM-DD-topic.md)
```

## Workflow

1. **Search** the `thoughts/` directory using Grep for content keywords and glob for filename patterns
2. **Use multiple search terms** — include synonyms, technical terms, and related concepts
3. **Categorize** findings into research documents vs implementation plans
4. **Return organized results** grouped by type with file paths and one-line descriptions from the title/header

## Output Format

```
## Thought Documents about [Topic]

### Research Documents
- `thoughts/shared/research/YYYY-MM-DD-topic.md` - Brief description from title

### Implementation Plans
- `thoughts/shared/plans/YYYY-MM-DD-topic.md` - Brief description from title

Total: N relevant documents found
```

## Guidelines

- Don't read full file contents — just scan titles and headers for relevance
- Be thorough — use multiple search terms and check all subdirectories
- Group logically by document type
- Include the date from the filename to help assess recency
- Report complete file paths from the repository root
