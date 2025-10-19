# Tech Stack

## Framework & Runtime
- **Application Framework:** Next.js 14 (App Router)
- **Language/Runtime:** TypeScript, Node.js
- **Package Manager:** npm

## Frontend
- **JavaScript Framework:** React 18
- **CSS Framework:** Tailwind CSS 3.4
- **UI Components:**
  - Radix UI (accessible component primitives - Avatar, Dropdown Menu, Icons, Scroll Area, Slot)
  - shadcn/ui component patterns
  - Lucide React (icon library)
- **Styling Utilities:**
  - clsx (conditional classNames)
  - tailwind-merge (merge Tailwind classes)
  - tailwindcss-animate (animations)
  - class-variance-authority (component variants)
- **State Management:**
  - TanStack Query (React Query) v5 - server state management, caching, and data fetching
  - TanStack React Query Devtools - debugging tool
  - TanStack React Table v8 - table state and rendering

## Database & Storage
- **Database:** PostgreSQL via Vercel Postgres
- **ORM/Query Builder:** Drizzle ORM v0.33 with Drizzle Kit
- **Database Schema:**
  - Users table (authentication)
  - Lists table (todo lists)
  - Todos table (individual tasks)
  - ListCollaborators table (list sharing and permissions)
- **Type Safety:**
  - type-fest (Tagged types for opaque type IDs)
  - Drizzle type inference for database models

## Authentication & Authorization
- **Authentication:** NextAuth v5 (beta) with Drizzle adapter
- **OAuth Providers:** GitHub OAuth
- **Session Management:** JWT-based sessions with NextAuth
- **Authorization:** Custom role-based permissions (owner/collaborator roles)

## Email & Notifications
- **Email Service:** Resend v4 (for transactional emails and notifications)

## Testing & Quality
- **Type Checking:** TypeScript 5 with strict mode
- **Linting:** ESLint with Next.js config
- **Code Formatting:** Enforced via lint-staged
- **Pre-commit Hooks:** Husky v9 with lint-staged
- **Toast Notifications:** Sonner v2 (user feedback)

## Development Tools
- **Environment Variables:** @next/env for environment configuration
- **Hot Reload:** Next.js built-in fast refresh
- **TypeScript Build:** tsc with noEmit for type checking in CI

## Deployment & Infrastructure
- **Hosting:** Vercel (inferred from @vercel/postgres dependency)
- **Database Hosting:** Vercel Postgres
- **Environment Management:** .env.local for local development, Vercel environment variables for production

## Code Organization
- **Architecture Pattern:** Feature-based organization
  - `/app` - Next.js App Router pages and layouts
  - `/app/lists/_actions` - Server actions for list operations
  - `/app/lists/_components` - React components for list features
  - `/app/lists/_hooks` - Custom React hooks
  - `/drizzle` - Database schema and migrations
  - `/lib` - Shared utilities and type definitions
  - `/ui` - Reusable UI components (shadcn/ui)
- **Type Safety:** Opaque types using type-fest Tagged types for domain IDs
- **Data Fetching:** Mix of React Server Components and TanStack Query for client-side data management

## Key Technical Decisions

### Next.js App Router
Using the modern App Router instead of Pages Router for:
- Server Components by default for better performance
- Improved routing and layouts
- Server Actions for mutations
- Streaming and Suspense support

### Drizzle ORM
Chosen over alternatives like Prisma for:
- Lightweight and performant
- SQL-like query builder syntax
- Excellent TypeScript inference
- Direct PostgreSQL integration

### TanStack Query
Used alongside Server Components for:
- Optimistic updates on client interactions
- Automatic cache invalidation
- Real-time data synchronization
- Improved perceived performance

### NextAuth v5
Using beta version for:
- App Router support
- Modern authentication patterns
- Flexible adapter system with Drizzle
- OAuth provider integration

### Opaque Types (type-fest Tagged)
Implementing tagged types for:
- Type-safe IDs (preventing ID confusion between Users, Lists, etc.)
- Better compile-time safety
- Self-documenting code
- Prevention of primitive obsession anti-pattern
