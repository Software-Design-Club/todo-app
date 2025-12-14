"use client";
import { Todo } from "@/app/lists/_actions/todo";
import { useState } from "react";

import { DataTable } from "@/ui/data-table";
import { ColumnDef, SortingState } from "@tanstack/react-table";
import { Button } from "@/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";

import { ChevronDown, ArrowUpDown } from "lucide-react";
import {
  useAddTodo,
  useDeleteTodo,
  useTodos,
  useUpdateTodoStatus,
  useUpdateTodoTitle,
} from "../_hooks/useTodos";
import { toast } from "sonner";
import type { List } from "@/lib/types";

const todoColumns = (
  editable: boolean,
  listId: List["id"],
  onDelete?: (todo: Todo) => void
): ColumnDef<Todo>[] => {
  return [
    {
      accessorKey: "id",
      header: ({ column }) => {
        return (
          <Button
            variant="outline"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            ID
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        );
      },
      enableSorting: true,
    },
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => {
        return editable ? (
          <EditableTitle todo={row.original} listId={listId} />
        ) : (
          row.original.title
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        return editable ? (
          <StatusDropDown todo={row.original} listId={listId} />
        ) : (
          row.original.status
        );
      },
    },
    {
      header: "Action",
      cell: ({ row }) => {
        return editable ? (
          <Button variant="outline" onClick={() => onDelete?.(row.original)}>
            Delete
          </Button>
        ) : null;
      },
    },
  ];
};

export default function TodoList({
  todos,
  editable = false,
  listId,
}: {
  todos: Todo[];
  editable?: boolean;
  listId: List["id"];
}) {
  const queriedTodos = useTodos(listId, todos);

  const [initialSort, updateInitialSort] = useState<SortingState>([
    { id: "id", desc: false },
  ]);

  const deleteTodoMutation = useDeleteTodo(listId);

  const handleDelete = async (todo: Todo) => {
    try {
      deleteTodoMutation.mutate(todo.id, {
        onSuccess: () => {
          toast.success("Todo deleted successfully");
        },
        onError: (error) => {
          toast.error(`Failed to delete todo: ${error.message}`);
        },
      });
    } catch (error) {
      console.error(error);
      toast.error("An unexpected error occurred");
    }
  };

  return (
    <div>
      <DataTable
        data={queriedTodos ?? []}
        columns={todoColumns(editable, listId, handleDelete)}
        initialSort={initialSort}
        updateInitialSort={updateInitialSort}
      />
      {editable && <AddTodoForm listId={listId} />}
    </div>
  );
}

const EditableTitle = ({
  todo,
  listId,
}: {
  todo: Todo;
  listId: List["id"];
}) => {
  const [title, setTitle] = useState(todo.title);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateTitleMutation = useUpdateTodoTitle(listId);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError("Title cannot be empty");
      toast.error("Title cannot be empty");
      return;
    }

    try {
      updateTitleMutation.mutate(
        { todoId: todo.id, title },
        {
          onSuccess: () => {
            setIsEditing(false);
            setError(null);

            toast.success("Todo title updated");
          },
          onError: (err) => {
            setError(err.message || "Failed to update todo");
            toast.error("Failed to update todo title");
          },
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update todo");
      console.error("Error updating todo:", err);
    }
  };

  return (
    <div className="flex flex-col gap-2 w-fit">
      {error && <span className="text-red-500 text-sm">{error}</span>}
      <div className="flex flex-row gap-2">
        {isEditing ? (
          <form onSubmit={handleSave} className="flex gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="px-2 py-1 border rounded-md min-w-[200px]"
              autoFocus
            />
            <Button type="submit" variant="outline" size="sm">
              Save
            </Button>
          </form>
        ) : (
          <>
            <span className="w-[300px]">{title}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              Edit
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

// Dropdown menu of all the possible statuses
const StatusDropDown = ({
  todo,
  listId,
}: {
  todo: Todo;
  listId: List["id"];
}) => {
  const [currentStatus, setCurrentStatus] = useState(todo.status);
  const statuses: Todo["status"][] = ["not started", "in progress", "done"];

  const updateStatusMutation = useUpdateTodoStatus(listId);

  const updateStatus = async (todoId: number, status: Todo["status"]) => {
    updateStatusMutation.mutate(
      { todoId, status },
      {
        onSuccess: (newStatus) => {
          setCurrentStatus(newStatus);
          toast.success(`Status updated to: ${newStatus}`);
        },
        onError: (error) => {
          toast.error(`Failed to update status: ${error.message}`);
        },
      }
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="ml-auto inline-flex">
          {currentStatus} <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {statuses.map((todoStatus, index) => {
          return (
            <DropdownMenuItem
              key={index}
              onClick={() => updateStatus(todo.id, todoStatus)}
            >
              {todoStatus}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const AddTodoForm = ({ listId }: { listId: List["id"] }) => {
  const [todo, setTodo] = useState<Pick<Todo, "title" | "status" | "listId">>({
    title: "",
    status: "not started",
    listId: listId,
  });
  const statuses: Todo["status"][] = ["not started", "in progress", "done"];

  const addTodoMutation = useAddTodo();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!todo.title.trim()) {
      toast.error("Title cannot be empty");
      return;
    }

    addTodoMutation.mutate(todo, {
      onSuccess: () => {
        toast.success("Todo added successfully");
        // Clear the input field after successful addition
        setTodo({ title: "", status: "not started", listId: listId });
      },
      onError: (error) => {
        console.error(error);
        toast.error(`Failed to add todo: ${error.message}`);
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mt-4">
      <input
        type="text"
        value={todo.title}
        onChange={(e) => setTodo({ ...todo, title: e.target.value })}
        placeholder="Add a new todo..."
        className="flex-1 px-2 py-1 border border-input bg-background text-foreground rounded-md"
        required
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="ml-auto">
            {todo.status} <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {statuses.map((todoStatus, index) => {
            return (
              <DropdownMenuItem
                key={index}
                onClick={() => setTodo({ ...todo, status: todoStatus })}
              >
                {todoStatus}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button type="submit">Add Todo</Button>
    </form>
  );
};
