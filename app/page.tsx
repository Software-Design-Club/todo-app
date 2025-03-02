import { auth } from "@/auth";

import { redirect } from "next/navigation";
import UserLists from "@/app/lists/_components/user-lists";

export default async function Home() {
  const session = await auth();
  const user = session?.user;
  if (!user?.email) {
    redirect("/sign-in");
  }

  return (
    <div className="grid grid-rows-[20px_1fr_20px]  p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-8 row-start-2 sm:items-start">
        <UserLists userEmail={user.email} />
      </main>
      <footer className="row-start-3 flex gap-6 flex-wrap items-center justify-center"></footer>
    </div>
  );
}
