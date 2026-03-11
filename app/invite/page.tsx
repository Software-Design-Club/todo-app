import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { acceptInvitationWorkflow } from "@/lib/invitations/service";
import type {
  AuthenticatedUser,
  InvitationSecret,
  InvitePageOutcome,
} from "@/lib/types";

function OutcomeMessage({ outcome }: { outcome: InvitePageOutcome }) {
  switch (outcome.kind) {
    case "pending_approval":
      return (
        <div className="flex flex-col items-center gap-4 p-8">
          <h1 className="text-2xl font-bold">Approval Required</h1>
          <p className="text-muted-foreground text-center max-w-md">
            Your email address does not match the invitation. The list owner has
            been notified and will need to approve your access.
          </p>
        </div>
      );
    case "invalid":
      return (
        <div className="flex flex-col items-center gap-4 p-8">
          <h1 className="text-2xl font-bold">Invalid Invitation</h1>
          <p className="text-muted-foreground text-center max-w-md">
            This invitation link is not valid. Please check the link and try
            again.
          </p>
        </div>
      );
    case "expired":
      return (
        <div className="flex flex-col items-center gap-4 p-8">
          <h1 className="text-2xl font-bold">Invitation Expired</h1>
          <p className="text-muted-foreground text-center max-w-md">
            This invitation has expired. Please ask the list owner to send a new
            invitation.
          </p>
        </div>
      );
    case "revoked":
      return (
        <div className="flex flex-col items-center gap-4 p-8">
          <h1 className="text-2xl font-bold">Invitation Revoked</h1>
          <p className="text-muted-foreground text-center max-w-md">
            This invitation has been revoked by the list owner.
          </p>
        </div>
      );
    case "already_resolved":
      return (
        <div className="flex flex-col items-center gap-4 p-8">
          <h1 className="text-2xl font-bold">Invitation Already Used</h1>
          <p className="text-muted-foreground text-center max-w-md">
            This invitation has already been used.
          </p>
        </div>
      );
  }
}

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : undefined;

  if (!token) {
    return (
      <div className="flex justify-center items-center h-screen">
        <OutcomeMessage outcome={{ kind: "invalid" }} />
      </div>
    );
  }

  const session = await auth();
  const viewer: AuthenticatedUser | null = session?.user
    ? {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      }
    : null;

  const result = await acceptInvitationWorkflow({
    invitationSecret: token as InvitationSecret,
    viewer,
    now: new Date(),
  });

  if (result.kind === "redirect_to_sign_in") {
    redirect(`/sign-in?redirectTo=${encodeURIComponent(result.redirectTo)}`);
  }

  if (result.kind === "accepted") {
    redirect(`/lists/${result.listId}`);
  }

  return (
    <div className="flex justify-center items-center h-screen">
      <OutcomeMessage outcome={result} />
    </div>
  );
}
