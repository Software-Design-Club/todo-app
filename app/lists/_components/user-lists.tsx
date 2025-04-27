import { getLists } from "@/app/lists/_actions/list";
import Link from "next/link";
import React from "react";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import CreateListForm from "./create-list";

type ListWithDetails = Awaited<ReturnType<typeof getLists>>[number] & {
  // todoCount: number;
};

interface ListsProps {
  userEmail: string;
  currentPath: string;
}

const UserLists: React.FC<ListsProps> = async ({ userEmail, currentPath }) => {
  const lists = (await getLists(userEmail)) as ListWithDetails[];
  const creatorId = lists[0].creatorId;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2>
          {currentPath === "/lists" ? (
            "Your Lists"
          ) : (
            <Link href="/lists">Your Lists</Link>
          )}
        </h2>
        <CreateListForm creatorId={creatorId} />
      </div>

      <Table>
        <TableCaption>A list of your todo lists.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">List Name</TableHead>
            <TableHead>Todos</TableHead>
            <TableHead className="text-right">Last Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lists.map((list) => (
            <TableRow key={list.id}>
              <TableCell className="font-medium">
                <Link
                  className="text-blue-500 hover:underline"
                  href={`/lists/${list.id}`}
                >
                  {list.title}
                </Link>
              </TableCell>
              <TableCell>N/A</TableCell>
              <TableCell className="text-right">
                {list.updatedAt
                  ? new Date(list.updatedAt).toLocaleDateString()
                  : "N/A"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default UserLists;
