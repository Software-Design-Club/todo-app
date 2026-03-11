import type { Tagged } from "type-fest";

type AppBaseUrl =
  | Tagged<`http://${string}`, "AppBaseUrl">
  | Tagged<`https://${string}`, "AppBaseUrl">;
type EmailFromAddress = Tagged<string, "EmailFromAddress">;
type ResendApiKey = Tagged<string, "ResendApiKey">;
type ResendWebhookSecret = Tagged<string, "ResendWebhookSecret">;

export type InvitationEnv = {
  resendApiKey: ResendApiKey;
  emailFrom: EmailFromAddress;
  appBaseUrl: AppBaseUrl;
  resendWebhookSecret?: ResendWebhookSecret;
};

function readRequiredKey(env: NodeJS.ProcessEnv, key: keyof NodeJS.ProcessEnv) {
  const value = env[key]?.trim();

  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }

  return value;
}

function normalizeEmailAddress(rawValue: string, key: string) {
  const normalizedValue = rawValue.trim().toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(normalizedValue)) {
    throw new Error(`Invalid env var ${key}: must be a valid email address`);
  }

  return normalizedValue as EmailFromAddress;
}

function normalizeAppBaseUrl(rawValue: string) {
  let url: URL;

  try {
    url = new URL(rawValue.trim());
  } catch {
    throw new Error("Invalid env var APP_BASE_URL: must be a valid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Invalid env var APP_BASE_URL: must use http or https");
  }

  const normalizedPathname = url.pathname.replace(/\/+$/, "");
  const normalizedUrl = `${url.origin}${normalizedPathname}${url.search}${url.hash}`;

  return normalizedUrl as AppBaseUrl;
}

/**
 * @contract verifyInvitationEnv
 *
 * Validates and normalizes invitation environment configuration.
 *
 * @param env - The process environment object.
 * @returns A normalized InvitationEnv if all required settings are present and valid.
 *
 * @effects
 * - Returns a normalized configuration object iff all required invitation settings
 *   are present and syntactically valid.
 * - Rejects missing required keys by naming the missing key.
 * - Rejects invalid values by naming the offending key and reason.
 * - Accepts only http or https application base URLs.
 */
export function verifyInvitationEnv(env: NodeJS.ProcessEnv): InvitationEnv {
  const resendApiKey = readRequiredKey(env, "RESEND_API_KEY");
  const emailFrom = normalizeEmailAddress(
    readRequiredKey(env, "EMAIL_FROM"),
    "EMAIL_FROM",
  );
  const appBaseUrl = normalizeAppBaseUrl(readRequiredKey(env, "APP_BASE_URL"));
  const resendWebhookSecret = env.RESEND_WEBHOOK_SECRET?.trim();

  return {
    resendApiKey: resendApiKey as ResendApiKey,
    emailFrom,
    appBaseUrl,
    resendWebhookSecret: resendWebhookSecret
      ? (resendWebhookSecret as ResendWebhookSecret)
      : undefined,
  };
}
