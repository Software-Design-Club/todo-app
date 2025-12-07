import List from "../_components/list";
import { getList } from "@/app/lists/_actions/list";
import { getCollaborators } from "@/app/lists/_actions/collaborators";
import { canViewList } from "@/app/lists/_actions/permissions";
import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";

const ListPage = async ({ params }: { params: { listId: string } }) => {
  const { listId } = params;
  const numericListId = Number(listId);

  if (!listId || isNaN(numericListId)) {
    notFound();
  }

  const list = await getList(numericListId);
  const collaborators = await getCollaborators(list.id);
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const canView = canViewList(list, collaborators, userId);

  if (!canView) {
    // Private list - not authorized
    if (!userId) {
      // Not logged in - redirect to sign-in
      redirect("/sign-in");
    }
    // Logged in but not a collaborator - 404
    notFound();
  }

  return (
    <div>
      <List listId={numericListId} />
    </div>
  );
};

export default ListPage;
