interface InvitationEmailTemplateProps {
  inviterName: string;
  listTitle: string;
  acceptUrl: string;
  expiresAt: Date;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderInvitationEmail(props: InvitationEmailTemplateProps): string {
  const inviterName = escapeHtml(props.inviterName);
  const listTitle = escapeHtml(props.listTitle);
  const acceptUrl = escapeHtml(props.acceptUrl);
  const expiry = escapeHtml(props.expiresAt.toLocaleString());

  return `<!DOCTYPE html>
<main style="font-family: Arial, sans-serif; line-height: 1.5;">
  <h1>Invitation to collaborate</h1>
  <p>${inviterName} invited you to collaborate on <strong>${listTitle}</strong>.</p>
  <p><a href="${acceptUrl}">Accept invitation</a></p>
  <p>This one-time link expires on ${expiry}.</p>
</main>`;
}
