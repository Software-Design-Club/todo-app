"use client";
import {
  Todo,
  updateTodoStatus,
  createTodo,
  deleteTodo,
  updateTodoTitle,
} from "@/app/lists/_actions/todo";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

const todoColumns = (
  editable: boolean,
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
          <EditableTitle todo={row.original} />
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
          <StatusDropDown todo={row.original} />
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

// Function to fetch todos for a specific list
const fetchTodos = async (listId: string | number): Promise<Todo[]> => {
  // You can implement this to fetch from your API
  // For now, we'll just return an empty array
  const response = await fetch(`/api/lists/${listId}/todos`);
  if (!response.ok) {
    throw new Error('Failed to fetch todos');
  }
  return response.json();
};

export default function TodoList({
  todos,
  editable = false,
  listId,
}: {
  todos: Todo[];
  editable?: boolean;
  listId: string | number;
}) {
  const queryClient = useQueryClient();
  
  // Use the initial todos as fallback data
  const { data = todos } = useQuery({
    queryKey: ['todos', listId],
    queryFn: () => fetchTodos(listId),
    initialData: todos,
  });

  const [initialSort, updateInitialSort] = useState<SortingState>([
    { id: "title", desc: false },
  ]);

  // Mutation for adding a todo
  const addTodoMutation = useMutation({
    mutationFn: createTodo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos', listId] });
    },
  });

  // Mutation for deleting a todo
  const deleteTodoMutation = useMutation({
    mutationFn: (todoId: number) => deleteTodo(todoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos', listId] });
    },
  });

  const addTodo = (todo: Pick<Todo, "title" | "status" | "listId">) => {
    addTodoMutation.mutate(todo);
  };

  const handleDelete = (todo: Todo) => {
    deleteTodoMutation.mutate(todo.id);
  };

  return (
    <div>
      <DataTable
        data={data}
        columns={todoColumns(editable, handleDelete)}
        initialSort={initialSort}
        updateInitialSort={updateInitialSort}
      />
      {editable && <AddTodoForm listId={listId} addTodo={addTodo} />}
    </div>
  );
}

const EditableTitle = ({ todo }: { todo: Todo }) => {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(todo.title);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateTitleMutation = useMutation({
    mutationFn: ({ todoId, title }: { todoId: number, title: string }) => 
      updateTodoTitle(todoId, title),
    onSuccess: () => {
      setIsEditing(false);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to update todo");
      console.error("Error updating todo:", err);
    }
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    updateTitleMutation.mutate({ todoId: todo.id, title });
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
// Current status to be the one show
const StatusDropDown = ({ todo }: { todo: Todo }) => {
  const queryClient = useQueryClient();
  const [currentStatus, setCurrentStatus] = useState(todo.status);
  const statuses: Todo["status"][] = ["not started", "in progress", "done"];
  
  const updateStatusMutation = useMutation({
    mutationFn: ({ todoId, status }: { todoId: number, status: Todo["status"] }) => 
      updateTodoStatus(todoId, status),
    onSuccess: (newStatus) => {
      setCurrentStatus(newStatus);
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
  });
  
  const updateStatus = (todoId: number, status: Todo["status"]) => {
    // Optimistic update
    setCurrentStatus(status);
    updateStatusMutation.mutate({ todoId, status });
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="ml-auto">
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

const AddTodoForm = ({
  listId,
  addTodo,
}: {
  listId: string | number;
  addTodo: (todo: Pick<Todo, "title" | "status" | "listId">) => void;
}) => {
  const [todo, setTodo] = useState<Pick<Todo, "title" | "status" | "listId">>({
    title: "",
    status: "not started",
    listId: Number(listId),
  });
  const statuses: Todo["status"][] = ["not started", "in progress", "done"];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (todo.title.trim()) {
      addTodo(todo);
      // Reset form
      setTodo({
        title: "",
        status: "not started",
        listId: Number(listId),
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mt-4">
      <input
        type="text"
        value={todo.title}
        onChange={(e) => setTodo({ ...todo, title: e.target.value })}
        placeholder="Add a new todo..."
        className="flex-1 px-3 py-2 border rounded-md"
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
