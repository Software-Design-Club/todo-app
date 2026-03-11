import type { AbsoluteInvitationUrl } from "@/lib/types";

export function buildInvitationEmailHtml(acceptanceUrl: AbsoluteInvitationUrl): string {
  return `<html><body><p>You have been invited to collaborate on a todo list.</p><p><a href="${acceptanceUrl}">Accept invitation</a></p></body></html>`;
}
