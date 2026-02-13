import { NextResponse } from "next/server";
import { updateTodoTitle } from "@/app/lists/_actions/todo";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const todoId = parseInt(id, 10);
    if (Number.isNaN(todoId)) {
      return new NextResponse("Invalid todo id", { status: 400 });
    }

    const { title } = await request.json();
    if (!title || typeof title !== "string") {
      return new NextResponse("Invalid title", { status: 400 });
    }

    await updateTodoTitle(todoId, title);

    return NextResponse.json({ message: "Todo updated successfully" });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Authentication required.") {
        return new NextResponse("Unauthorized", { status: 401 });
      }
      if (error.message === "Todo not found.") {
        return new NextResponse("Not found", { status: 404 });
      }
      if (error.message === "You do not have permission to edit this list.") {
        return new NextResponse("Forbidden", { status: 403 });
      }
    }
    console.error("Error updating todo:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
