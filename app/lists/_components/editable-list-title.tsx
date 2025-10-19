"use client";

import { useState, useMemo } from "react";
import { Button } from "@/ui/button";
import { toast } from "sonner";
import { updateListTitle } from "@/app/lists/_actions/list";
import type { List, User } from "@/lib/types";

interface EditableListTitleProps {
  list: List;
  editable: boolean;
  userId: User["id"];
}

const MAX_TITLE_LENGTH = 255;

export default function EditableListTitle({
  list,
  editable,
  userId,
}: EditableListTitleProps) {
  const [title, setTitle] = useState<List["title"]>(list.title);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Compute validation state
  const trimmedTitle = useMemo(() => title.trim(), [title]);
  const charCount = trimmedTitle.length;
  const isValid = charCount > 0 && charCount <= MAX_TITLE_LENGTH;

  const validationError = useMemo(() => {
    if (charCount === 0) return "Title cannot be empty";
    if (charCount > MAX_TITLE_LENGTH)
      return `Title cannot exceed ${MAX_TITLE_LENGTH} characters`;
    return null;
  }, [charCount]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValid) {
      setError(validationError);
      toast.error(validationError || "Invalid title");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await updateListTitle(list.id, title as string, userId);
      setIsEditing(false);
      toast.success("List title updated");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to update list title";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setTitle(list.title);
    setIsEditing(false);
    setError(null);
  };

  if (!editable) {
    return <h2 className="text-2xl font-bold">{list.title}</h2>;
  }

  return (
    <div className="flex flex-col gap-2">
      {isEditing ? (
        <form onSubmit={handleSave} className="flex flex-col gap-2">
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value as List["title"])}
              className="px-3 py-2 border rounded-md text-2xl font-bold min-w-[300px]"
              autoFocus
              disabled={isLoading}
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={!isValid || isLoading}
            >
              {isLoading ? "Saving..." : "Save"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
          </div>
          <div className="flex flex-col gap-1">
            <span
              className={`text-sm ${
                charCount > MAX_TITLE_LENGTH ? "text-red-500" : "text-gray-500"
              }`}
            >
              {charCount}/{MAX_TITLE_LENGTH} characters
            </span>
            {validationError && (
              <span className="text-red-500 text-sm">{validationError}</span>
            )}
            {error && <span className="text-red-500 text-sm">{error}</span>}
          </div>
        </form>
      ) : (
        <div className="flex flex-row gap-2 items-center">
          <h2 className="text-2xl font-bold">{list.title}</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
          >
            Edit
          </Button>
        </div>
      )}
    </div>
  );
}
