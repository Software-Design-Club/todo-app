"use client";

import {
  useMutation,
  useQueryClient,
  UseMutationResult,
  useQuery,
} from "@tanstack/react-query";
import {
  Todo,
  createTodo,
  deleteTodo,
  updateTodoStatus,
  updateTodoTitle,
} from "../_actions/todo";

import { getTodos } from "../_actions/todo";
import type { List } from "../_actions/list";

// Key factory for React Query cache
const todoKeys = {
  all: ["todos"] as const,
  lists: (listId?: string | number) =>
    listId
      ? ([...todoKeys.all, "list", listId] as const)
      : ([...todoKeys.all, "lists"] as const),
  todo: (id: number) => [...todoKeys.all, "todo", id] as const,
};

/**
 * Get all todos for a list
 * @param listId - The id of the list to get todos for
 * @param initialTodos - Optional initial todos to use
 * @returns The todos for the list
 */

export function useTodos(listId: List["id"], initialTodos?: Todo[]) {
  const { data: todos } = useQuery({
    queryKey: todoKeys.lists(listId),
    queryFn: () => getTodos(listId),
    initialData: initialTodos ? initialTodos : undefined,
  });

  return todos;
}

export function useAddTodo(): UseMutationResult<
  Todo,
  Error,
  Pick<Todo, "title" | "status" | "listId">
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTodo,
    onSuccess: (newTodo) => {
      // Invalidate the list's todos
      queryClient.invalidateQueries({
        queryKey: todoKeys.lists(newTodo.listId),
      });

      // Alternatively, you can update the cache directly for optimistic updates
      queryClient.setQueryData(
        todoKeys.lists(newTodo.listId),
        (old: Todo[] = []) => [...old, newTodo]
      );
    },
  });
}

export function useDeleteTodo(
  listId: number | string
): UseMutationResult<void, Error, number> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTodo,
    onSuccess: () => {
      // More targeted invalidation using the listId
      queryClient.invalidateQueries({ queryKey: todoKeys.lists(listId) });

      // Still invalidate all todos as a fallback
      queryClient.invalidateQueries({ queryKey: todoKeys.all });

      // Optionally, we can do optimistic UI updates here
      queryClient.setQueryData(todoKeys.lists(listId), (old: Todo[] = []) =>
        old.filter((todo) => todo.status !== "deleted")
      );
    },
  });
}

export function useUpdateTodoStatus(
  listId: number | string
): UseMutationResult<
  Todo["status"],
  Error,
  { todoId: number; status: Todo["status"] }
> {
  const queryClient = useQueryClient();
  const numericListId =
    typeof listId === "string" ? parseInt(listId, 10) : listId;

  return useMutation({
    mutationFn: ({ todoId, status }) => updateTodoStatus(todoId, status),
    onSuccess: (status, { todoId }) => {
      // Invalidate specific todo and list
      queryClient.invalidateQueries({ queryKey: todoKeys.todo(todoId) });
      queryClient.invalidateQueries({
        queryKey: todoKeys.lists(numericListId),
      });

      // Optionally update the cache directly for faster UI updates
      queryClient.setQueryData(
        todoKeys.lists(numericListId),
        (old: Todo[] = []) => {
          return old.map((todo) =>
            todo.id === todoId ? { ...todo, status } : todo
          );
        }
      );
    },
  });
}

export function useUpdateTodoTitle(
  listId: number | string
): UseMutationResult<void, Error, { todoId: number; title: string }> {
  const queryClient = useQueryClient();
  const numericListId =
    typeof listId === "string" ? parseInt(listId, 10) : listId;

  return useMutation({
    mutationFn: ({ todoId, title }) => updateTodoTitle(todoId, title),
    onSuccess: (_, { todoId, title }) => {
      // Invalidate specific todo and list
      queryClient.invalidateQueries({ queryKey: todoKeys.todo(todoId) });
      queryClient.invalidateQueries({
        queryKey: todoKeys.lists(numericListId),
      });

      // Update the cache directly for faster UI updates
      queryClient.setQueryData(
        todoKeys.lists(numericListId),
        (old: Todo[] | undefined) => {
          if (!old) return old;
          return old.map((todo: Todo) =>
            todo.id === todoId ? { ...todo, title } : todo
          );
        }
      );
    },
  });
}
