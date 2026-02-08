import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

interface InvitationEmailTemplateProps {
  inviterName: string;
  listTitle: string;
  acceptUrl: string;
  expiresAt: Date;
}

export function InvitationEmailTemplate({
  inviterName,
  listTitle,
  acceptUrl,
  expiresAt,
}: InvitationEmailTemplateProps) {
  const expiry = expiresAt.toLocaleString();

  return (
    <main style={{ fontFamily: "Arial, sans-serif", lineHeight: 1.5 }}>
      <h1>Invitation to collaborate</h1>
      <p>
        {inviterName} invited you to collaborate on <strong>{listTitle}</strong>.
      </p>
      <p>
        <a href={acceptUrl}>Accept invitation</a>
      </p>
      <p>This one-time link expires on {expiry}.</p>
    </main>
  );
}

export function renderInvitationEmail(props: InvitationEmailTemplateProps): string {
  return `<!DOCTYPE html>${renderToStaticMarkup(
    <InvitationEmailTemplate {...props} />
  )}`;
}
