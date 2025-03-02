import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { eq } from "drizzle-orm";
import { TodosTable } from "@/drizzle/schema";
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { title } = await request.json();
    if (!title || typeof title !== "string") {
      return new NextResponse("Invalid title", { status: 400 });
    }

    const db = drizzle(sql);
    await db
      .update(TodosTable)
      .set({ title, updatedAt: new Date() })
      .where(eq(TodosTable.id, parseInt(params.id)));

    return NextResponse.json({ message: "Todo updated successfully" });
  } catch (error) {
    console.error("Error updating todo:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
