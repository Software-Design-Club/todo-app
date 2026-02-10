# Collaborative Todo App

A Next.js application for creating and sharing todo lists with collaborators.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Database**: Drizzle ORM + Vercel Postgres
- **Auth**: NextAuth v5 (beta)
- **Data Fetching**: TanStack Query
- **Styling**: Tailwind CSS + shadcn/ui (Radix primitives)
- **Email**: Resend
- **Types**: type-fest (Tagged types)
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
npm run start      # Start production server
npm run typecheck  # TypeScript check
npm run lint       # ESLint
```

Pre-commit hooks run lint + typecheck automatically via Husky.

## Core Domain Types

Defined in `lib/types.ts` and inferred from `drizzle/schema.ts`:

| Type | Source | Description |
|------|--------|-------------|
| `User` | lib/types.ts | id, name, email, image? (tagged) |
| `List` | lib/types.ts | id, title, creatorId, visibility, state, timestamps (tagged) |
| `ListWithRole` | lib/types.ts | List + userRole |
| `ListUser` | lib/types.ts | User + listId + Role |
| `ListVisibility` | schema | private, public |
| `ListState` | schema | active, archived |
| `CollaboratorRole` | schema | owner, collaborator |
| `TodoStatus` | schema | not started, in progress, done, deleted |

Helpers: `createTaggedList`, `createTaggedUser`, `createTaggedListUser`.

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
