# Specification: List Visibility Controls

## Overview

Enable list owners to control list visibility between private (default) and public. Public lists viewable by anyone with link, private lists accessible only to collaborators.

## User Stories

### US-1: List Owner Sets Visibility
**As a** list owner
**I want to** toggle my list between private and public
**So that** I can control who can view my list content

**Acceptance Criteria:**
- Toggle switch appears next to "Manage Collaborators" button
- Only list owners see the visibility toggle
- Default state is private (lock icon)
- Public state shows globe icon
- Toggle persists immediately to database

### US-2: Public List Viewing (Unauthenticated)
**As an** unauthenticated user
**I want to** view a public list via shared link
**So that** I can see list content without signing in

**Acceptance Criteria:**
- Can access public list URL without authentication
- See full list title and all todos
- Cannot add/edit/delete todos
- Cannot manage collaborators
- Cannot change visibility

### US-3: Public List Viewing (Authenticated Non-Collaborator)
**As an** authenticated user who is not a collaborator
**I want to** view a public list via shared link
**So that** I can see list content while logged in

**Acceptance Criteria:**
- Can access public list URL
- See full list title and all todos
- Cannot add/edit/delete todos
- Cannot manage collaborators
- Cannot change visibility

### US-4: Private List Access Control
**As a** list owner
**I want** my private lists protected from unauthorized access
**So that** only collaborators can view my list content

**Acceptance Criteria:**
- Non-collaborators cannot access private list URLs
- Unauthenticated users redirected to sign-in for private lists
- Only collaborators see private list content

## Technical Design

### Database Schema

**New Enum Type:**
```sql
CREATE TYPE list_visibility AS ENUM ('private', 'public');
```

**Schema Addition (`drizzle/schema.ts`):**
```typescript
export const ListVisibilityEnum = pgEnum("list_visibility", ["private", "public"]);

export const ListsTable = pgTable("lists", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  creatorId: integer("creatorId")
    .references(() => UsersTable.id)
    .notNull(),
  visibility: ListVisibilityEnum("visibility").default("private").notNull(), // NEW
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
```

**Migration File:**
```sql
CREATE TYPE "list_visibility" AS ENUM('private', 'public');
ALTER TABLE "lists" ADD COLUMN "visibility" "list_visibility" DEFAULT 'private' NOT NULL;
```

### Type Definitions

**Update `lib/types.ts`:**
```typescript
import { ListVisibilityEnum } from "@/drizzle/schema";

export type ListVisibility = (typeof ListVisibilityEnum.enumValues)[number];

export type List = {
  id: Tagged<(typeof ListsTable.$inferSelect)["id"], "ListId">;
  title: Tagged<(typeof ListsTable.$inferSelect)["title"], "ListTitle">;
  creatorId: Tagged<(typeof ListsTable.$inferSelect)["creatorId"], "CreatorId">;
  visibility: Tagged<ListVisibility, "ListVisibility">; // NEW
  createdAt: Tagged<(typeof ListsTable.$inferSelect)["createdAt"], "CreatedAt">;
  updatedAt: Tagged<(typeof ListsTable.$inferSelect)["updatedAt"], "UpdatedAt">;
};
```

### Server Actions

**Update `getList()` in `app/lists/_actions/list.ts`:**
```typescript
export async function getList(listId: number): Promise<List | null> {
  const db = drizzle(sql);
  const [list] = await db
    .select()
    .from(ListsTable)
    .where(eq(ListsTable.id, listId));

  if (!list) return null;

  // Public lists: return without auth check
  if (list.visibility === "public") {
    return createTaggedList(list);
  }

  // Private lists: require collaborator access
  const session = await auth();
  if (!session?.user) {
    return null; // Or throw unauthorized
  }

  const collaborators = await getCollaborators(list.id);
  const isCollaborator = collaborators.some(
    (c) => c.User.id === session.user.id
  );

  if (!isCollaborator) {
    return null; // Or throw unauthorized
  }

  return createTaggedList(list);
}
```

**Update `getTodos()` in `app/lists/_actions/todo.ts`:**
```typescript
export async function getTodos(listId: List["id"]) {
  const db = drizzle(sql);

  // Get list to check visibility
  const [list] = await db
    .select()
    .from(ListsTable)
    .where(eq(ListsTable.id, listId));

  if (!list) return [];

  // Private lists: verify authorization
  if (list.visibility === "private") {
    const session = await auth();
    if (!session?.user) {
      return []; // Or throw unauthorized
    }

    const collaborators = await getCollaborators(listId);
    const isCollaborator = collaborators.some(
      (c) => c.User.id === session.user.id
    );

    if (!isCollaborator) {
      return []; // Or throw unauthorized
    }
  }

  // Fetch and return todos
  const todos = await db
    .select()
    .from(TodosTable)
    .where(
      and(eq(TodosTable.listId, listId), not(eq(TodosTable.status, "deleted")))
    );

  return todos;
}
```

**New Action - `updateListVisibility()`:**
```typescript
export async function updateListVisibility(
  listId: List["id"],
  visibility: ListVisibility,
  userId: User["id"]
): Promise<List> {
  // Validate user is list owner
  const collaborators = await getCollaborators(listId);

  if (!isAuthorizedToChangeVisibility(collaborators, userId)) {
    throw new Error("Only list owners can change visibility");
  }

  const db = drizzle(sql);
  const [updatedList] = await db
    .update(ListsTable)
    .set({
      visibility,
      updatedAt: new Date(),
    })
    .where(eq(ListsTable.id, listId))
    .returning();

  revalidatePath("/lists");
  revalidatePath(`/lists/${listId}`);

  return createTaggedList(updatedList);
}
```

### Permissions Update

**Add to `app/lists/_actions/permissions.ts`:**
```typescript
export function isAuthorizedToChangeVisibility(
  collaborators: ListUser[],
  userId: User["id"]
): boolean {
  return collaborators.some(
    (collaborator) =>
      collaborator.User.id === userId && collaborator.Role === "owner"
  );
}

export function canViewList(
  list: List,
  collaborators: ListUser[],
  userId: User["id"] | null
): boolean {
  // Public lists viewable by anyone
  if (list.visibility === "public") {
    return true;
  }

  // Private lists require collaborator access
  if (!userId) return false;
  return collaborators.some((c) => c.User.id === userId);
}

export function canEditList(
  list: List,
  collaborators: ListUser[],
  userId: User["id"] | null
): boolean {
  // Must be authenticated
  if (!userId) return false;

  // Must be a collaborator (regardless of visibility)
  return isAuthorizedToEditList(collaborators, userId);
}
```

### UI Components

**New Component: `visibility-toggle.tsx`**

Location: `app/lists/_components/visibility-toggle.tsx`

```typescript
"use client";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Lock, Globe } from "lucide-react";
import { useState } from "react";
import type { List, ListVisibility } from "@/lib/types";

interface VisibilityToggleProps {
  listId: List["id"];
  initialVisibility: ListVisibility;
  onToggle: (visibility: ListVisibility) => Promise<void>;
}

export function VisibilityToggle({
  listId,
  initialVisibility,
  onToggle,
}: VisibilityToggleProps) {
  const [visibility, setVisibility] = useState(initialVisibility);
  const [isPending, setIsPending] = useState(false);

  const isPublic = visibility === "public";

  const handleToggle = async (checked: boolean) => {
    const newVisibility = checked ? "public" : "private";
    setIsPending(true);
    try {
      await onToggle(newVisibility);
      setVisibility(newVisibility);
    } catch (error) {
      console.error("Failed to update visibility:", error);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <Switch
        id={`visibility-${listId}`}
        checked={isPublic}
        onCheckedChange={handleToggle}
        disabled={isPending}
      />
      <Label
        htmlFor={`visibility-${listId}`}
        className="flex items-center gap-1 text-sm"
      >
        {isPublic ? (
          <>
            <Globe className="h-4 w-4" />
            Public
          </>
        ) : (
          <>
            <Lock className="h-4 w-4" />
            Private
          </>
        )}
      </Label>
    </div>
  );
}
```

**Install Switch Component:**
```bash
npx shadcn@latest add switch
```

### List Component Updates

**Update `app/lists/_components/list.tsx`:**

Add visibility toggle next to Manage Collaborators button (only for owners):

```typescript
// Add imports
import { VisibilityToggle } from "./visibility-toggle";
import { updateListVisibility } from "@/app/lists/_actions/list";
import { isAuthorizedToChangeVisibility } from "@/app/lists/_actions/permissions";

// In component body
const canChangeVisibility = user
  ? isAuthorizedToChangeVisibility(collaborators, user.id)
  : false;

// In render - add alongside Manage Collaborators
{canChangeVisibility && (
  <VisibilityToggle
    listId={list.id}
    initialVisibility={list.visibility}
    onToggle={async (visibility) => {
      "use server";
      await updateListVisibility(list.id, visibility, user.id);
    }}
  />
)}
```

**Conditional Rendering for Read-Only Mode:**

When user is not a collaborator viewing a public list:
- Hide todo input field
- Hide todo status toggle buttons
- Hide delete buttons
- Hide "Manage Collaborators" button
- Hide visibility toggle

### Visual Indicators

**In List Header:**
- Show lock icon (🔒) next to title for private lists
- Show globe icon (🌐) next to title for public lists
- Icon visible to all users viewing the list

```typescript
// In EditableListTitle or List component
<span className="ml-2">
  {list.visibility === "public" ? (
    <Globe className="h-4 w-4 text-gray-500" />
  ) : (
    <Lock className="h-4 w-4 text-gray-500" />
  )}
</span>
```

### Page-Level Authorization

**Update `app/lists/[listId]/page.tsx`:**

```typescript
import { auth } from "@/auth";
import { getList } from "../_actions/list";
import { getCollaborators } from "../_actions/collaborators";
import { notFound, redirect } from "next/navigation";

const ListPage = async ({ params }: { params: { listId: string } }) => {
  const { listId } = params;
  const list = await getList(Number(listId));

  if (!list) {
    notFound();
  }

  // For private lists, verify access
  if (list.visibility === "private") {
    const session = await auth();
    if (!session?.user) {
      redirect("/sign-in");
    }

    const collaborators = await getCollaborators(list.id);
    const isCollaborator = collaborators.some(
      (c) => c.User.id === session.user.id
    );

    if (!isCollaborator) {
      notFound(); // Or show "access denied" page
    }
  }

  return <div>{listId && <List listId={Number(listId)} />}</div>;
};
```

## Component Hierarchy

```
ListPage
├── List
│   ├── EditableListTitle (+ visibility icon)
│   ├── CollaboratorAvatars
│   ├── VisibilityToggle (owner only)
│   ├── ManageCollaborators (owner only)
│   └── TodoList
│       ├── TodoItem (read-only for non-collaborators)
│       └── AddTodo (hidden for non-collaborators)
```

## Data Flow

```
1. User visits /lists/[listId]
2. Page checks list visibility
3. If private:
   - Check auth → redirect to sign-in if needed
   - Check collaborator status → 404 if not collaborator
4. If public:
   - Allow access regardless of auth
5. Determine edit permissions:
   - Non-collaborators: read-only
   - Collaborators: full edit
   - Owners: full edit + visibility control
6. Render UI with appropriate permissions
```

## Security Considerations

1. **Server-side authorization**: All visibility checks happen server-side
2. **API protection**: getTodos() and getList() enforce visibility rules
3. **No client-side only protection**: UI hiding is supplementary, not primary security
4. **Mutation protection**: All write operations check collaborator status regardless of visibility

## Manual Testing Checklist

1. Owner can toggle visibility private → public
2. Owner can toggle visibility public → private
3. Toggle updates icon (lock ↔ globe) immediately
4. Unauthenticated user can view public list (read-only)
5. Unauthenticated user cannot view private list (redirect to sign-in)
6. Authenticated non-collaborator can view public list (read-only)
7. Authenticated non-collaborator cannot view private list (404)
8. All edit controls hidden for non-collaborators on public lists
9. Collaborator permissions unchanged by visibility setting
10. Non-owner collaborators cannot see visibility toggle

## Migration Plan

1. Add database migration for visibility column
2. Run migration (all existing lists default to "private")
3. Deploy updated server actions with authorization logic
4. Deploy UI components
5. Monitor for any access issues

## Dependencies

- **shadcn/ui Switch component** - needs installation
- **lucide-react** - Lock and Globe icons (already in project)

## Out of Scope

- Public list discovery/search
- Additional visibility levels (e.g., "unlisted")
- Public list analytics
- Sharing UI beyond link access
- Collaborator permission changes based on visibility
