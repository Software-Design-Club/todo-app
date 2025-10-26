import { auth } from "@/auth";
import { redirect } from "next/navigation";
import UserLists from "@/app/lists/_components/user-lists";
export default async function NotFound() {
  const session = await auth();
  const user = session?.user;
  if (!user?.email) {
    redirect("/");
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h2 className="text-2xl font-bold mb-4">List Not Found</h2>
      <UserLists userId={user.id} currentPath={""} />
    </div>
  );
}
