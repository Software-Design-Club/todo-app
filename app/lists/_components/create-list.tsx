"use client";

import React, { useState } from "react";
import { createList } from "@/app/lists/_actions/list";
import { Button } from "@/ui/button";
import { toast } from "sonner";

export default function CreateListForm({ creatorId }: { creatorId: number }) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");

  // Handle form submission
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); // Prevent default browser submission
    if (!title.trim()) {
      toast.error("List title cannot be empty.");
      return;
    }
    // Create FormData manually
    const formData = new FormData();
    formData.set("creatorId", creatorId.toString());
    formData.set("title", title);

    createList(formData);
    setShowForm(false);
    setTitle("");
  }

  return (
    <div>
      {!showForm ? (
        <Button onClick={() => setShowForm(true)}>+ New List</Button>
      ) : (
        <form onSubmit={handleSubmit} className="flex gap-2 items-center">
          <input
            type="text"
            name="title"
            placeholder="List name"
            className="flex-1 px-2 py-1 border rounded-md"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <Button type="submit">Create</Button>
          <Button
            variant="outline"
            onClick={() => {
              setShowForm(false);
              setTitle("");
            }}
          >
            Cancel
          </Button>
        </form>
      )}
    </div>
  );
}
