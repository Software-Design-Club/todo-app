"use client";

import * as React from "react";
import { ColumnDef, SortingState } from "@tanstack/react-table";
import { DataTable } from "@/ui/data-table";
import { ListWithRole } from "@/lib/types";
import { RoleBadge } from "@/components/ui/role-badge";
import { Button } from "@/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { ChevronDownIcon, CaretSortIcon, CaretUpIcon, CaretDownIcon } from "@radix-ui/react-icons";
import Link from "next/link";

type FilterOption = "all" | "owner" | "collaborator";

interface UserListsTableProps {
  lists: ListWithRole[];
}

export function UserListsTable({ lists }: UserListsTableProps) {
  // State for sorting
  const [sorting, setSorting] = React.useState<SortingState>([]);

  // State for filtering
  const [filterOption, setFilterOption] = React.useState<FilterOption>("all");

  // Filter the lists based on the selected filter option
  const filteredLists = React.useMemo(() => {
    if (filterOption === "all") {
      return lists;
    }
    return lists.filter((list) => list.userRole === filterOption);
  }, [lists, filterOption]);

  // Column definitions
  const columns: ColumnDef<ListWithRole>[] = React.useMemo(
    () => [
      {
        accessorKey: "title",
        header: "title",
        cell: ({ row }) => {
          const list = row.original;
          return (
            <Link
              className="text-blue-500 hover:underline font-medium"
              href={`/lists/${list.id}`}
            >
              {list.title}
            </Link>
          );
        },
      },
      {
        accessorKey: "userRole",
        header: ({ column }) => {
          return (
            <div className="flex items-center justify-center">
              <button
                className="flex items-center gap-1 font-medium hover:text-foreground/80"
                onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              >
                Role
                {column.getIsSorted() === "asc" ? (
                  <CaretUpIcon className="h-4 w-4" />
                ) : column.getIsSorted() === "desc" ? (
                  <CaretDownIcon className="h-4 w-4" />
                ) : (
                  <CaretSortIcon className="h-4 w-4" />
                )}
              </button>
            </div>
          );
        },
        cell: ({ row }) => {
          const list = row.original;
          return (
            <div className="text-center">
              <RoleBadge role={list.userRole} />
            </div>
          );
        },
        sortingFn: (rowA, rowB) => {
          // Sort owner before collaborator
          const roleA = rowA.original.userRole;
          const roleB = rowB.original.userRole;

          if (roleA === roleB) return 0;
          return roleA === "owner" ? -1 : 1;
        },
        size: 150, // Fixed width for role column
      },
      {
        accessorKey: "todos",
        header: "Todos",
        cell: () => {
          return <span>N/A</span>;
        },
      },
      {
        accessorKey: "updatedAt",
        header: "Last Updated",
        cell: ({ row }) => {
          const list = row.original;
          return (
            <div className="text-right">
              {list.updatedAt
                ? new Date(list.updatedAt).toLocaleDateString()
                : "N/A"}
            </div>
          );
        },
      },
    ],
    []
  );

  // Filter labels for display
  const filterLabels: Record<FilterOption, string> = {
    all: "All Lists",
    owner: "My Lists (Owner)",
    collaborator: "Shared with Me (Collaborator)",
  };

  return (
    <div className="space-y-4">
      {/* Filter Controls */}
      <div className="flex items-center justify-between">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="min-w-[200px] justify-between">
              {filterLabels[filterOption]}
              <ChevronDownIcon className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[200px]">
            <DropdownMenuRadioGroup
              value={filterOption}
              onValueChange={(value) => setFilterOption(value as FilterOption)}
            >
              <DropdownMenuRadioItem value="all">
                All Lists
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="owner">
                My Lists (Owner)
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="collaborator">
                Shared with Me (Collaborator)
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={filteredLists}
        initialSort={sorting}
        updateInitialSort={setSorting}
      />
    </div>
  );
}
