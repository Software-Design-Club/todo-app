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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/ui/alert-dialog";
import {
  ChevronDownIcon,
  CaretSortIcon,
  CaretUpIcon,
  CaretDownIcon,
} from "@radix-ui/react-icons";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import Link from "next/link";
import {
  archiveList,
  unarchiveList,
  deleteList,
} from "@/app/lists/_actions/list";
import { toast } from "sonner";

type FilterOption = "all" | "owner" | "collaborator" | "archived";

interface UserListsTableProps {
  lists: ListWithRole[];
  archivedLists: ListWithRole[];
}

export function UserListsTable({
  lists,
  archivedLists,
}: UserListsTableProps) {
  // State for sorting
  const [sorting, setSorting] = React.useState<SortingState>([]);

  // State for filtering
  const [filterOption, setFilterOption] = React.useState<FilterOption>("all");

  // State for delete confirmation dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [listToDelete, setListToDelete] = React.useState<ListWithRole | null>(
    null
  );

  // Determine which lists to show based on filter
  const displayLists = React.useMemo(() => {
    if (filterOption === "archived") {
      return archivedLists;
    }
    if (filterOption === "all") {
      return lists;
    }
    return lists.filter((list) => list.userRole === filterOption);
  }, [lists, archivedLists, filterOption]);

  const isArchivedView = filterOption === "archived";

  const handleArchive = React.useCallback(
    async (list: ListWithRole) => {
      try {
        await archiveList(list.id);
        toast.success(`"${list.title}" has been archived`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to archive list"
        );
      }
    },
    []
  );

  const handleUnarchive = React.useCallback(
    async (list: ListWithRole) => {
      try {
        await unarchiveList(list.id);
        toast.success(`"${list.title}" has been restored`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to restore list"
        );
      }
    },
    []
  );

  const handleDeleteClick = (list: ListWithRole) => {
    setListToDelete(list);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!listToDelete) return;

    try {
      await deleteList(listToDelete.id);
      toast.success(`"${listToDelete.title}" has been permanently deleted`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete list"
      );
    } finally {
      setDeleteDialogOpen(false);
      setListToDelete(null);
    }
  };

  // Column definitions for active lists
  const activeColumns: ColumnDef<ListWithRole>[] = React.useMemo(
    () => [
      {
        accessorKey: "title",
        header: "Title",
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
                onClick={() =>
                  column.toggleSorting(column.getIsSorted() === "asc")
                }
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
          const roleA = rowA.original.userRole;
          const roleB = rowB.original.userRole;
          if (roleA === roleB) return 0;
          return roleA === "owner" ? -1 : 1;
        },
        size: 150,
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
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const list = row.original;
          // Only show archive action for owners
          if (list.userRole !== "owner") {
            return null;
          }
          return (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleArchive(list)}
              title="Archive list"
            >
              <Archive className="h-4 w-4" />
            </Button>
          );
        },
      },
    ],
    [handleArchive]
  );

  // Column definitions for archived lists
  const archivedColumns: ColumnDef<ListWithRole>[] = React.useMemo(
    () => [
      {
        accessorKey: "title",
        header: "Title",
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
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const list = row.original;
          return (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleUnarchive(list)}
                title="Restore list"
              >
                <ArchiveRestore className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteClick(list)}
                title="Delete permanently"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        },
      },
    ],
    [handleUnarchive]
  );

  // Filter labels for display
  const filterLabels: Record<FilterOption, string> = {
    all: "All Lists",
    owner: "My Lists (Owner)",
    collaborator: "Shared with Me (Collaborator)",
    archived: "Archived Lists",
  };

  return (
    <div className="space-y-4">
      {/* Filter Controls */}
      <div className="flex items-center justify-between">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="min-w-[200px] justify-between"
            >
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
              <DropdownMenuRadioItem value="archived">
                Archived Lists
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Data Table */}
      <DataTable
        columns={isArchivedView ? archivedColumns : activeColumns}
        data={displayLists}
        initialSort={sorting}
        updateInitialSort={setSorting}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete List Permanently</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{listToDelete?.title}&quot;?
              This action is irreversible. All tasks and collaborator
              associations will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
