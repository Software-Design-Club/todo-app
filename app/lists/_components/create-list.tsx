"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createList } from "@/app/lists/_actions/list";
import { Button } from "@/ui/button";
import { toast } from "sonner";

export default function CreateListForm({ creatorId }: { creatorId: number }) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");

  const queryClient = useQueryClient();

  // Set up the mutation using React Query
  const createListMutation = useMutation<
    Awaited<ReturnType<typeof createList>>, // Type of the data returned on success
    Error, // Type of the error
    FormData // Type of the variables passed to the mutation function
  >({
    mutationFn: (formData) => createList(formData), // The function to call
    onSuccess: (data) => {
      // On success:
      setShowForm(false); // Hide the form
      setTitle(""); // Reset the input field
      // Invalidate the query for lists to refresh the data
      queryClient.invalidateQueries({ queryKey: ["lists", creatorId] });
      toast.success(`List "${data.title}" created successfully!`);
    },
    onError: (error) => {
      // On error:
      toast.error(`Failed to create list: ${error.message}`);
    },
  });

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
    // Trigger the mutation
    createListMutation.mutate(formData);
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
            disabled={createListMutation.status === "pending"}
            required
          />
          <Button
            type="submit"
            disabled={createListMutation.status === "pending"}
          >
            {createListMutation.status === "pending" ? "Creating..." : "Create"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setShowForm(false);
              setTitle("");
            }}
            disabled={createListMutation.status === "pending"}
          >
            Cancel
          </Button>
        </form>
      )}
    </div>
  );
}
