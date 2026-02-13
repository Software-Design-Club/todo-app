interface InvitationEmailParams {
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

export function renderInvitationEmail(params: InvitationEmailParams): string {
  const inviterName = escapeHtml(params.inviterName);
  const listTitle = escapeHtml(params.listTitle);
  const acceptUrl = escapeHtml(params.acceptUrl);
  const expiry = params.expiresAt.toISOString();

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h1 style="font-size: 20px; margin-bottom: 12px;">You're invited to collaborate</h1>
      <p>${inviterName} invited you to collaborate on <strong>${listTitle}</strong>.</p>
      <p>
        <a href="${acceptUrl}" style="color: #2563eb; text-decoration: underline;">
          Accept invitation
        </a>
      </p>
      <p style="font-size: 12px; color: #6b7280;">This invite expires at ${expiry}.</p>
    </div>
  `.trim();
}
