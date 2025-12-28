# Public List Link Sharing Implementation Plan

## Overview

Add a "Copy Link" button that appears for anyone viewing a public list, allowing them to easily copy the shareable URL to their clipboard. The button will show a visual state transition (Copy → Check icon) upon successful copy.

## Current State Analysis

### What Exists
- Public lists are already viewable by anyone at `/lists/[listId]` (`app/lists/[listId]/page.tsx:21-31`)
- `canViewList()` returns `true` for public lists regardless of authentication (`permissions.ts:50-63`)
- Visibility toggle component pattern exists (`visibility-toggle.tsx`) - can be used as reference
- Toast notifications configured via Sonner (`app/layout.tsx`)
- Lucide icons available: `Copy`, `Check`, `Link`

### Key Discoveries
- The share button should appear in `list.tsx:93-121` in the header area
- Unlike `VisibilityToggle`, the share button doesn't need permission checks - it shows when `list.visibility === "public"`
- No backend changes needed - URL construction uses `window.location.origin + /lists/[listId]`

## Desired End State

When a list is public:
1. A "Copy Link" button appears in the list header (visible to everyone, including unauthenticated users)
2. Clicking the button copies the full URL to clipboard
3. Button shows visual feedback: Copy icon transitions to Check icon for 2 seconds
4. Button is disabled during the "copied" state to prevent rapid re-clicking

### Verification
- Navigate to a public list while logged out → Share button is visible
- Click "Copy Link" → URL is in clipboard, button shows checkmark
- After 2 seconds → Button reverts to Copy icon
- Navigate to a private list → Share button is NOT visible

## What We're NOT Doing

- No share dropdown/popover with additional options
- No pretty URLs with UUID tokens (would require database changes)
- No toast notifications (user chose button state only)
- No email/social sharing options
- No changes to the URL structure

## Implementation Approach

Create a single client component `ShareLinkButton` that:
1. Renders only when `visibility === "public"`
2. Uses `navigator.clipboard.writeText()` for copying
3. Manages local state for the copied/idle transition
4. Uses a 2-second timeout to reset state

## Phase 1: Create ShareLinkButton Component

### Overview
Create a new client component that handles clipboard copying with visual state feedback.

### Changes Required:

#### 1. Create ShareLinkButton Component
**File**: `app/lists/_components/share-link-button.tsx` (new file)

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/ui/button";
import { Copy, Check } from "lucide-react";
import type { List } from "@/lib/types";

interface ShareLinkButtonProps {
  listId: List["id"];
}

export function ShareLinkButton({ listId }: ShareLinkButtonProps) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    const shareUrl = `${window.location.origin}/lists/${listId}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setIsCopied(true);

      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    } catch (error) {
      console.error("Failed to copy link:", error);
    }
  };

  return (
    <Button
      onClick={handleCopy}
      variant="outline"
      size="sm"
      disabled={isCopied}
      className="flex items-center gap-2"
    >
      {isCopied ? (
        <>
          <Check className="h-4 w-4" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          Copy Link
        </>
      )}
    </Button>
  );
}
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles without errors: `npm run typecheck`
- [x] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build` (skipped per user)

#### Manual Verification:
- [x] Component file exists at `app/lists/_components/share-link-button.tsx`

**Implementation Note**: This phase creates the component in isolation. Proceed to Phase 2 to integrate it.

---

## Phase 2: Integrate ShareLinkButton into List Component

### Overview
Add the ShareLinkButton to the list header, conditionally rendered when the list is public.

### Changes Required:

#### 1. Update List Component
**File**: `app/lists/_components/list.tsx`

**Add import** (after line 6):
```tsx
import { ShareLinkButton } from "@/app/lists/_components/share-link-button";
```

**Add ShareLinkButton in the header** (after line 94, before the VisibilityToggle block):
```tsx
{list.visibility === "public" && (
  <ShareLinkButton listId={list.id} />
)}
```

**Full context of the change area** (lines 93-102 become):
```tsx
<div className="flex items-center space-x-4">
  <CollaboratorAvatars collaborators={collaborators} />
  {list.visibility === "public" && (
    <ShareLinkButton listId={list.id} />
  )}
  {canChangeVisibility && user && (
    <VisibilityToggle
      listId={list.id}
      userId={user.id}
      initialVisibility={list.visibility}
      onToggle={updateListVisibility}
    />
  )}
  {editableCollaborators && (
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles without errors: `npm run typecheck`
- [x] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build` (skipped per user)

#### Manual Verification:
- [ ] Create or use a public list
- [ ] Navigate to the list page → "Copy Link" button is visible in header
- [ ] Click "Copy Link" → Button shows checkmark and "Copied" text
- [ ] Paste in another location → Correct URL is pasted (e.g., `http://localhost:3000/lists/5`)
- [ ] Wait 2 seconds → Button reverts to "Copy Link" with copy icon
- [ ] Set list to private → "Copy Link" button disappears
- [ ] View public list while logged out → "Copy Link" button is still visible

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before considering the feature complete.

---

## Testing Strategy

### Unit Tests:
- Not required for this minimal implementation (component is simple with no complex logic)

### Integration Tests:
- Not required for Phase 1 scope

### Manual Testing Steps:
1. Start dev server: `npm run dev`
2. Log in and create a new list
3. Set the list to "Public" using the visibility toggle
4. Verify "Copy Link" button appears
5. Click "Copy Link" and verify:
   - Button shows Check icon and "Copied" text
   - Button is disabled (can't click again)
   - After 2 seconds, button reverts to Copy icon and "Copy Link"
6. Paste the clipboard content and verify it's the correct URL
7. Set list back to "Private" and verify button disappears
8. Log out and navigate to a public list URL directly
9. Verify "Copy Link" button is visible for unauthenticated users

## Performance Considerations

- Minimal impact: Single client component with local state only
- No additional API calls or database queries
- No server-side changes

## Migration Notes

- No database migrations required
- No breaking changes
- Feature is additive only

## References

- Research document: `thoughts/shared/research/2025-12-21-public-list-link-sharing.md`
- Visibility toggle pattern: `app/lists/_components/visibility-toggle.tsx`
- List component (integration point): `app/lists/_components/list.tsx:93-121`
