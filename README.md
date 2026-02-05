# TaskCollab - Collaborative Todo App

A Next.js application for creating and sharing todo lists with collaborators.

## Mission

TaskCollab is a simple todo list application that helps individuals organize their tasks and optionally share lists with others when collaboration is needed.

### The Problem

Most todo apps either lack basic collaboration features or overwhelm users with enterprise project management complexity. Individuals need something in between - a simple way to organize tasks that can easily extend to basic collaboration when needed, without forcing them into complex team workflows.

### Our Solution

TaskCollab provides straightforward task management with optional list sharing. Create lists, manage tasks with basic status tracking, and invite collaborators only when you need to. No forced team features, no unnecessary complexity - just tasks and the option to share.

### Key Features

- **User Authentication**: Sign in securely with GitHub to access your lists from anywhere
- **Todo Lists**: Create and organize multiple lists for different projects or contexts
- **Task Management**: Add, edit, update status, and delete tasks within your lists
- **Task Status Tracking**: Mark tasks as not started, in progress, or done
- **List Sharing**: Share specific lists with collaborators by email invitation
- **Role-Based Permissions**: Owners manage list settings and collaborators, collaborators manage tasks
- **Email Invitations**: Invite anyone via email, even if they don't have an account yet

## Tech Stack

### Framework & Runtime
- **Application Framework**: Next.js 14 (App Router)
- **Language/Runtime**: TypeScript, Node.js
- **Package Manager**: npm

### Frontend
- **JavaScript Framework**: React 18
- **CSS Framework**: Tailwind CSS 3.4
- **UI Components**: Radix UI, shadcn/ui, Lucide React
- **State Management**: TanStack Query (React Query) v5
- **Table Management**: TanStack React Table v8

### Database & Storage
- **Database**: PostgreSQL via Vercel Postgres
- **ORM/Query Builder**: Drizzle ORM v0.33 with Drizzle Kit
- **Type Safety**: type-fest (Tagged types for opaque type IDs)

### Authentication & Authorization
- **Authentication**: NextAuth v5 (beta) with Drizzle adapter
- **OAuth Providers**: GitHub OAuth
- **Authorization**: Custom role-based permissions (owner/collaborator roles)

### Email & Notifications
- **Email Service**: Resend v4

### Development Tools
- **Type Checking**: TypeScript 5 with strict mode
- **Linting**: ESLint with Next.js config
- **Pre-commit Hooks**: Husky v9 with lint-staged
- **Toast Notifications**: Sonner v2

### Deployment & Infrastructure
- **Hosting**: Vercel
- **Database Hosting**: Vercel Postgres

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Project Documentation

- [`/plan/backlog.md`](./plan/backlog.md) - Development backlog with epics and tickets
- [`/agent-os/product/mission.md`](./agent-os/product/mission.md) - Full product mission and vision
- [`/agent-os/product/tech-stack.md`](./agent-os/product/tech-stack.md) - Detailed technical decisions

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
