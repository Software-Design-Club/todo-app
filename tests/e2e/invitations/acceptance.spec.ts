import { expect, test } from "@playwright/test";
import { buildSignInRedirectForInvite } from "../../../lib/invitations/redirect";

test("builds redirect url for unauthenticated invite acceptance", async () => {
  const redirectUrl = buildSignInRedirectForInvite("token-123");
  expect(redirectUrl).toContain("/sign-in?redirectTo=");
  expect(redirectUrl).toContain(encodeURIComponent("/invite?token=token-123"));
});
