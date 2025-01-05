"use client";

import { Todo, updateTodoStatus } from "@/app/actions";
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

const todoColumns: ColumnDef<Todo>[] = [
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
      return <StatusDropDown todo={row.original} />;
    },
  },
];

export default function TodoList({ todos }: { todos: Todo[] }) {
  const [data] = useState(todos);

  return <DataTable data={data} columns={todoColumns} />;
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
