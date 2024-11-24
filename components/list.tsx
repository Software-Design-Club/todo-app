import { getListWithTodos } from "@/app/actions";

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
      <h2>{listWithTodos.title}</h2>
      <ul>
        {listWithTodos.todos.map((todo) => (
          <li key={todo.id}>{todo.title}</li>
        ))}
      </ul>
    </div>
  );
};

export default List;
