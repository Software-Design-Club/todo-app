import { getList } from "@/app/lists/_actions/list";
import TodoList from "@/app/lists/_components/todo-list";
import { auth } from "@/auth";
import React from "react";
import { getTodos } from "../_actions/todo";

interface ListProps {
  listId: number;
}

const List: React.FC<ListProps> = async ({ listId }) => {
  // Get list info like title and visibility
  // Get todos for lists
  // Render TodoList
  const list = await getList(listId);
  const todos = await getTodos(listId);

  const session = await auth();
  let editable = false;
  const user = session?.user;
  if (user?.email) {
    editable = true;
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">{list.title}</h2>
      <TodoList todos={todos} editable={editable} listId={listId} />
    </div>
  );
};

export default List;
