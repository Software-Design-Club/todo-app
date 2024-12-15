import { getLists } from "@/app/actions";
import Link from "next/link";
import React from "react";

interface ListsProps {
  userEmail: string;
}

const UserLists: React.FC<ListsProps> = async ({ userEmail }) => {
  const lists = await getLists(userEmail);

  return (
    <div>
      <h2>Your Lists</h2>
      <ul>
        {lists.map((list) => (
          <li key={list.id}>
            <Link
              className="text-blue-500 hover:underline"
              href={`/lists/${list.id}`}
            >
              {list.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default UserLists;
