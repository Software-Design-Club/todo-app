# Collaborative Todo App

A Next.js application for creating and sharing todo lists with collaborators.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: Drizzle ORM + Vercel Postgres
- **Auth**: NextAuth v5 (beta)
- **Data Fetching**: TanStack Query
- **Styling**: Tailwind CSS + shadcn/ui (Radix primitives)
- **Version Control**: Jujutsu (jj)

## Project Structure

```
app/           → Pages and API routes (App Router)
lib/           → Shared utilities and types
drizzle/       → Database schema and migrations
ui/            → Reusable UI components (shadcn)
components/    → App-specific components
plan/          → Project roadmap and documentation
```

## Commands

```bash
npm run dev        # Start dev server
npm run build      # Production build
npm run typecheck  # TypeScript check
npm run lint       # ESLint
```

Pre-commit hooks run lint + typecheck automatically via Husky.

## Database

Schema defined in `drizzle/schema.ts`. Key tables:
- `UsersTable` - user accounts
- `ListsTable` - todo lists (with visibility: private/public)
- `ListCollaboratorsTable` - list membership and roles (owner/collaborator)
- `TodosTable` - individual todo items

Run migrations with `npx drizzle-kit push`.

## Version Control Notes

This repository uses **Jujutsu (jj)** for version control instead of Git.
- Use `jj` commands instead of `git` commands
- Jujutsu provides a more intuitive interface for managing changes
- Consult the Jujutsu documentation for workflow commands

## Additional Documentation

For detailed context on specific topics, read the relevant files in `plan/`:

- `plan/backlog.md` - Feature backlog and roadmap
