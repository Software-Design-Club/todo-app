export function buildInvitePath(inviteToken: string): string {
  const encodedToken = encodeURIComponent(inviteToken);
  return `/invite?token=${encodedToken}`;
}

export function buildSignInRedirectForInvite(inviteToken: string): string {
  const redirectTo = buildInvitePath(inviteToken);
  return `/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`;
}
