"use client";

import { Todo } from "@/app/actions";
import { useState } from "react";
import { DataTable } from "@/components/data-table";
import { ColumnDef } from "@tanstack/react-table";

type TodoRow = {
  title: string;
};

const todoColumns: ColumnDef<TodoRow>[] = [
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
  },
];

export default function TodoList({ todos }: { todos: Todo[] }) {
  const [data] = useState(todos);

  return <DataTable data={data} columns={todoColumns} />;
}
