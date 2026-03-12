import React from "react";
import type { InvitationSummary } from "@/lib/types";

interface PendingInvitationsListProps {
  invitations: InvitationSummary[];
}

export function PendingInvitationsList({ invitations }: PendingInvitationsListProps) {
  if (invitations.length === 0) {
    return null;
  }

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">Pending Invitations</h3>
      <ul className="space-y-2">
        {invitations.map((invitation) => {
          const badgeLabel =
            invitation.kind === "sent" ? "Invited" : "Pending Approval";

          return (
            <li
              key={String(invitation.invitationId)}
              className="flex items-center justify-between text-sm"
            >
              <span className="truncate text-sm">
                {invitation.invitedEmailNormalized}
              </span>
              <span className="ml-2 shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {badgeLabel}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
