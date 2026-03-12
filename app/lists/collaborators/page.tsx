import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { InviteByEmailForm } from "@/app/lists/_components/invite-by-email-form";
import { SentInvitationActions } from "@/app/lists/_components/sent-invitation-actions";
import { loadCollaboratorManagementWorkflow } from "@/lib/invitations/service";
import {
  approveInvitation,
  rejectInvitation,
  revokeInvitation,
} from "@/app/lists/_actions/invitations";
import type {
  CollaboratorManagementListView,
  InvitationId,
  InvitationSummary,
  UserId,
} from "@/lib/types";

function AcceptedCollaboratorsList({
  view,
}: {
  view: CollaboratorManagementListView;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
        Accepted Collaborators
      </h3>
      {view.acceptedCollaborators.length === 0 ? (
        <p className="text-sm text-gray-500">No collaborators yet.</p>
      ) : (
        <ul className="space-y-1">
          {view.acceptedCollaborators.map((collaborator) => (
            <li
              key={String(collaborator.userId)}
              className="flex items-center gap-2 text-sm"
            >
              <span className="font-medium">{collaborator.name}</span>
              <span className="text-gray-500">{collaborator.email}</span>
              <span className="text-xs text-gray-400 capitalize">
                ({collaborator.role})
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InvitationRow({
  invitation,
}: {
  invitation: InvitationSummary;
}) {
  if (invitation.kind === "pending_approval") {
    return (
      <li className="flex items-center justify-between gap-2 text-sm py-1">
        <div>
          <span className="font-medium">
            {invitation.invitedEmailNormalized}
          </span>
          <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-1 rounded">
            pending approval
          </span>
          {invitation.acceptedByEmail && (
            <span className="ml-2 text-xs text-gray-500">
              (accepted with: {invitation.acceptedByEmail})
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <form
            action={async () => {
              "use server";
              await approveInvitation({
                invitationId: invitation.invitationId as InvitationId,
              });
            }}
          >
            <button
              type="submit"
              className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded"
            >
              Approve
            </button>
          </form>
          <form
            action={async () => {
              "use server";
              await rejectInvitation({
                invitationId: invitation.invitationId as InvitationId,
              });
            }}
          >
            <button
              type="submit"
              className="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded"
            >
              Reject
            </button>
          </form>
        </div>
      </li>
    );
  }

  // sent invitation
  return (
    <li className="flex items-center justify-between gap-2 text-sm py-1">
      <div>
        <span className="font-medium">{invitation.invitedEmailNormalized}</span>
        <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-1 rounded">
          invited
        </span>
      </div>
      <div className="flex gap-2">
        <SentInvitationActions
          invitationId={invitation.invitationId as InvitationId}
        />
        <form
          action={async () => {
            "use server";
            await revokeInvitation({
              invitationId: invitation.invitationId as InvitationId,
            });
          }}
        >
          <button
            type="submit"
            className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-1 rounded"
          >
            Revoke
          </button>
        </form>
      </div>
    </li>
  );
}


function ListManagementCard({
  view,
}: {
  view: CollaboratorManagementListView;
}) {
  const openInvitations = view.invitations.filter((i) => i.kind === "sent");
  const pendingApproval = view.invitations.filter(
    (i) => i.kind === "pending_approval",
  );

  return (
    <div id={`list-${view.list.id}`} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
      <h2 className="text-lg font-bold">{view.list.title}</h2>

      <AcceptedCollaboratorsList view={view} />

      {openInvitations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Open Invitations
          </h3>
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {openInvitations.map((invitation) => (
              <InvitationRow
                key={String(invitation.invitationId)}
                invitation={invitation}
              />
            ))}
          </ul>
        </div>
      )}

      {pendingApproval.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Pending Approval
          </h3>
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {pendingApproval.map((invitation) => (
              <InvitationRow
                key={String(invitation.invitationId)}
                invitation={invitation}
              />
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Invite by Email
        </h3>
        <InviteByEmailForm listId={view.list.id} />
      </div>
    </div>
  );
}

export default async function CollaboratorsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const actorId = session.user.id as UserId;

  const viewData = await loadCollaboratorManagementWorkflow({ actorId });

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Collaborator Management</h1>

      {viewData.manageableLists.length === 0 ? (
        <p className="text-gray-500">
          You do not own any lists. Create a list to manage collaborators.
        </p>
      ) : (
        <div className="space-y-6">
          {viewData.manageableLists.map((listView) => (
            <ListManagementCard
              key={String(listView.list.id)}
              view={listView}
            />
          ))}
        </div>
      )}
    </div>
  );
}
