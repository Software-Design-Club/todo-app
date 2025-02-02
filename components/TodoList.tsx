"use client";

import { Todo, updateTodoStatus, createTodo } from "@/app/actions";
import { useState } from "react";
import { DataTable } from "@/components/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { ChevronDown } from "lucide-react";

const todoColumns = (editable: boolean): ColumnDef<Todo>[] => {
  return [
    {
      accessorKey: "id",
      header: "ID",
    },
    {
      accessorKey: "title",
      header: "Title",
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
  const addTodo = (todo: Todo) => {
    setData([...data, todo]);
  };
  return (
    <div>
      <DataTable data={data} columns={todoColumns(editable)} />
      {editable && <AddTodoForm listId={listId} addTodo={addTodo} />}
    </div>
  );
}

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

export const AddTodoForm = ({
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
