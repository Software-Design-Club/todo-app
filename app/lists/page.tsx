import { auth } from "@/auth";
import UserLists from "./_components/user-lists";
import { redirect } from "next/navigation";

export default async function ListsPage() {
  const session = await auth();

  if (!session?.user?.email) {
    // Redirect to sign-in page if not authenticated
    redirect("/sign-in");
  }

  const userEmail = session.user.email;

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">My Todo Lists</h1>
      <UserLists userEmail={userEmail} currentPath="/lists" />
    </div>
  );
}
