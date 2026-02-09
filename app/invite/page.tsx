import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { acceptInvitationToken } from "@/app/lists/_actions/invitations";
import { getInvitationAcceptanceUiState } from "@/lib/invitations/acceptance";
import { buildSignInRedirectForInvite } from "@/lib/invitations/redirect";

const TOKEN_PATTERN = /^[a-zA-Z0-9_-]{20,128}$/;

interface InvitePageProps {
  searchParams: Promise<{
    token?: string;
  }>;
}

export default async function InvitePage({ searchParams }: InvitePageProps) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-semibold">Invalid invitation</h1>
        <p className="mt-3 text-muted-foreground">
          The invitation token is missing.
        </p>
      </div>
    );
  }
  if (!TOKEN_PATTERN.test(token)) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-semibold">Invalid invitation</h1>
        <p className="mt-3 text-muted-foreground">
          Invalid invitation link format.
        </p>
      </div>
    );
  }

  const session = await auth();
  if (!session?.user) {
    redirect(buildSignInRedirectForInvite(token));
  }
  if (!session.user.email) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-semibold">Account error</h1>
        <p className="mt-3 text-muted-foreground">
          Your account is missing an email address. Please sign in with a
          provider that includes email.
        </p>
      </div>
    );
  }

  const result = await acceptInvitationToken({
    inviteToken: token,
  });
  const uiState = getInvitationAcceptanceUiState(result);

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold">{uiState.title}</h1>
      <p className="mt-3 text-muted-foreground">{uiState.description}</p>
      {uiState.listId ? (
        <Link
          href={`/lists/${uiState.listId}`}
          className="mt-4 inline-block text-blue-600 hover:underline"
        >
          Open list
        </Link>
      ) : null}
    </div>
  );
}
