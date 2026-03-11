import React from "react";

import type { AbsoluteInvitationUrl } from "@/lib/types";

type InvitationEmailProps = {
  acceptanceUrl: AbsoluteInvitationUrl;
};

export function InvitationEmail({ acceptanceUrl }: InvitationEmailProps) {
  return (
    <html>
      <body>
        <p>You have been invited to collaborate on a todo list.</p>
        <p>
          <a href={acceptanceUrl}>Accept invitation</a>
        </p>
      </body>
    </html>
  );
}
