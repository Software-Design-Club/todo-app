import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getCollaboratorsForLists } from "@/app/lists/_actions/collaborators";
import { getLists } from "@/app/lists/_actions/list";
import { listInvitationsForLists } from "@/lib/invitations/service";
import ManageCollaborators from "@/app/lists/_components/manage-collaborators";

export default async function CollaboratorManagementPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const lists = await getLists();
  const ownerLists = lists.filter((list) => list.userRole === "owner");
  const listIds = ownerLists.map((list) => list.id);

  const [collaboratorsMap, invitationsMap] = await Promise.all([
    getCollaboratorsForLists(listIds),
    listInvitationsForLists({ listIds }),
  ]);

  const listData = ownerLists.map((list) => ({
    list,
    collaborators: collaboratorsMap.get(list.id) ?? [],
    invitations: invitationsMap.get(list.id) ?? [],
  }));

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Collaborator Management</h1>
        <Link href="/lists" className="text-blue-600 hover:underline">
          Back to lists
        </Link>
      </div>

      {listData.length === 0 ? (
        <p className="text-muted-foreground">
          You do not own any lists yet, so there are no invitations to manage.
        </p>
      ) : (
        listData.map(({ list, collaborators, invitations }) => (
          <section key={list.id} className="rounded-lg border p-4">
            <h2 className="text-lg font-semibold mb-3">{list.title}</h2>
            <ManageCollaborators
              listId={list.id}
              initialCollaborators={collaborators}
              initialInvitations={invitations}
            />
          </section>
        ))
      )}
    </div>
  );
}
