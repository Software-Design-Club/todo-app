import List from "../_components/list";
import { getList } from "@/app/lists/_actions/list";
import { getCollaborators } from "@/app/lists/_actions/collaborators";
import { canViewList } from "@/app/lists/_actions/permissions";
import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";

const ListPage = async ({ params }: { params: Promise<{ listId: string }> }) => {
  const { listId } = await params;
  const numericListId = Number(listId);

  if (!listId || isNaN(numericListId)) {
    notFound();
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const list = await getList(numericListId);
  const collaborators = await getCollaborators(list.id);
  const userId = session.user.id;

  const canView = canViewList(list, collaborators, userId);

  if (!canView) {
    notFound();
  }

  return (
    <div>
      <List listId={numericListId} />
    </div>
  );
};

export default ListPage;
