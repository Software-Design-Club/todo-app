"use client";

import { Switch } from "@/components/ui/switch";
import { Lock, Globe } from "lucide-react";
import { useState } from "react";
import type { List, User } from "@/lib/types";

interface VisibilityToggleProps {
  listId: List["id"];
  userId: User["id"];
  initialVisibility: List["visibility"];
  onToggle: (
    listId: List["id"],
    visibility: List["visibility"],
    userId: User["id"]
  ) => Promise<List>;
}

export function VisibilityToggle({
  listId,
  userId,
  initialVisibility,
  onToggle,
}: VisibilityToggleProps) {
  const [visibility, setVisibility] = useState(initialVisibility);
  const [isPending, setIsPending] = useState(false);

  const isPublic = visibility === "public";

  const handleToggle = async (checked: boolean) => {
    const newVisibility = (
      checked ? "public" : "private"
    ) as List["visibility"];
    setIsPending(true);
    try {
      await onToggle(listId, newVisibility, userId);
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
      <span className="flex items-center gap-1 text-sm">
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
      </span>
    </div>
  );
}
