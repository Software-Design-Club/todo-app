"use client";

import React, { useState } from "react";
import { createList } from "@/app/lists/_actions/list";
import { Button } from "@/ui/button";

export default function CreateListForm({ creatorId }: { creatorId: number }) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      {!showForm ? (
        <Button onClick={() => setShowForm(true)}>+ New List</Button>
      ) : (
        <form action={createList} className="flex gap-2 items-center">
          <input type="hidden" name="creatorId" value={creatorId} />
          <input
            type="text"
            name="title"
            placeholder="List name"
            className="flex-1 px-2 py-1 border rounded-md"
            required
          />
          <Button type="submit">Create</Button>
          <Button variant="outline" onClick={() => setShowForm(false)}>
            Cancel
          </Button>
        </form>
      )}
    </div>
  );
}
