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

  const list = await getList(numericListId);
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const isPublicActiveList =
    list.visibility === "public" && list.state === "active";

  if (!userId && isPublicActiveList) {
    return (
      <div>
        <List listId={numericListId} />
      </div>
    );
  }

  if (!userId) {
    redirect("/sign-in");
  }

  const collaborators = await getCollaborators(list.id);
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
