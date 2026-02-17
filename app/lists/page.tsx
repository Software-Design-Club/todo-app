import { auth } from "@/auth";
import UserLists from "./_components/user-lists";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function ListsPage() {
  const session = await auth();

  if (!session?.user?.email) {
    // Redirect to sign-in page if not authenticated
    redirect("/sign-in");
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">My Todo Lists</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Need cross-list invite controls?{" "}
        <Link href="/lists/collaborators" className="text-blue-600 hover:underline">
          Open Collaborator Management
        </Link>
        .
      </p>
      <UserLists currentPath="/lists" />
    </div>
  );
}
