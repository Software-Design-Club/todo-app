"use client";
import {
  Todo,
  updateTodoStatus,
  createTodo,
  updateTodoTitle,
} from "@/app/actions";
import { useState } from "react";
import { DataTable } from "@/components/data-table";
import { ColumnDef, SortingState } from "@tanstack/react-table";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { ChevronDown, ArrowUpDown } from "lucide-react";

const todoColumns = (editable: boolean): ColumnDef<Todo>[] => {
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
  ];
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
  const [data, setData] = useState(todos);

  const [initialSort, updateInitialSort] = useState<SortingState>([
    { id: "title", desc: false },
  ]);

  const addTodo = (todo: Todo) => {
    setData([...data, todo]);
  };
  return (
    <div>
      <DataTable
        data={data}
        columns={todoColumns(editable)}
        initialSort={initialSort}
        updateInitialSort={updateInitialSort}
      />
      {editable && <AddTodoForm listId={listId} addTodo={addTodo} />}
    </div>
  );
}

const EditableTitle = ({ todo }: { todo: Todo }) => {
  const [title, setTitle] = useState(todo.title);
  const [isEditing, setIsEditing] = useState(false);

  const handleSave = async () => {
    await updateTodoTitle(todo.id, title);
    setIsEditing(false);
  };

  return (
    <div className="flex items-center gap-2 w-fit">
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
  );
};

// Dropdown menu of all the possible statuses
// Current status to be the one show
const StatusDropDown = ({ todo }: { todo: Todo }) => {
  const [currentStatus, setCurrentStatus] = useState(todo.status);
  const statuses: Todo["status"][] = ["not started", "in progress", "done"];
  const updateStatus = async (todoId: number, status: Todo["status"]) => {
    const newlySavedStatus = await updateTodoStatus(todoId, status);
    setCurrentStatus(newlySavedStatus);
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
  addTodo: (todo: Todo) => void;
}) => {
  const [todo, setTodo] = useState<Pick<Todo, "title" | "status" | "listId">>({
    title: "",
    status: "not started",
    listId: Number(listId),
  });
  const statuses: Todo["status"][] = ["not started", "in progress", "done"];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newTodo = await createTodo(todo);
      addTodo(newTodo);
    } catch (error) {
      console.error(error);
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
