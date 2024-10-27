import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Circle } from "lucide-react";
import { UsersListTodos } from "@/app/actions";
import { Fragment } from "react";

export default function ReadOnlyTodoList({
  listWithTodos,
}: {
  listWithTodos: UsersListTodos[];
}) {
  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Your Todo List</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] w-full pr-4">
          <ul className="space-y-2">
            {listWithTodos.map((listWithTodo) => (
              <Fragment key={listWithTodo.id}>
                <h3 className={"text-lg"} key={listWithTodo.id}>
                  {listWithTodo.title}
                </h3>
                {listWithTodo.todos.map((todo) => (
                  <li key={todo.id} className="flex items-center space-x-2">
                    <Circle
                      className="h-5 w-5 text-muted-foreground"
                      aria-hidden="true"
                    />
                    {todo.title}
                  </li>
                ))}
              </Fragment>
            ))}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
