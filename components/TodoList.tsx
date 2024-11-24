"use client";

import { UsersListTodos } from "@/app/actions";
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
    cell: ({ row }) => {
      return <div>{row.getValue("id")}</div>;
    },
  },
  {
    accessorKey: "title",
    header: "Title",
    cell: ({ row }) => {
      return <div>{row.getValue("title")}</div>;
    },
  },
];

export default function ReadOnlyTodoList({
  listWithTodos,
}: {
  listWithTodos: UsersListTodos[];
}) {
  const [data] = useState(listWithTodos[0].todos);

  return <DataTable data={data} columns={todoColumns} />;
}
