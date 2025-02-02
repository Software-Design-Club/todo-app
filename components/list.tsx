import { getListWithTodos } from "@/app/actions";
import TodoList from "@/components/TodoList";
import { auth } from "@/auth";
import React from "react";

interface ListProps {
  listId: number;
}

const List: React.FC<ListProps> = async ({ listId }) => {
  // Get list info like title and visibility
  // Get todos for lists
  // Render TodoList
  const listWithTodos = await getListWithTodos(listId);

  const session = await auth();
  let editable = false;
  const user = session?.user;
  if (user?.email) {
    editable = true;
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">{listWithTodos.title}</h2>
      <TodoList
        todos={listWithTodos.todos}
        editable={editable}
        listId={listId}
      />
    </div>
  );
};

export default List;
