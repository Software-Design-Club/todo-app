import { getListWithTodos } from "@/app/actions";
import TodoList from "@/components/TodoList";

import React from "react";

interface ListProps {
  listId: number;
}

const List: React.FC<ListProps> = async ({ listId }) => {
  // Get list info like title and visibility
  // Get todos for lists
  // Render TodoList
  const listWithTodos = await getListWithTodos(listId);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">{listWithTodos.title}</h2>
      <TodoList todos={listWithTodos.todos} />
    </div>
  );
};

export default List;
