import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

function readRequiredKey(env, key) {
  const value = env[key]?.trim();

  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }

  return value;
}

function normalizeEmailAddress(rawValue, key) {
  const normalizedValue = rawValue.trim().toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(normalizedValue)) {
    throw new Error(`Invalid env var ${key}: must be a valid email address`);
  }

  return normalizedValue;
}

function normalizeAppBaseUrl(rawValue) {
  let url;

  try {
    url = new URL(rawValue.trim());
  } catch {
    throw new Error("Invalid env var APP_BASE_URL: must be a valid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Invalid env var APP_BASE_URL: must use http or https");
  }

  const normalizedPathname = url.pathname.replace(/\/+$/, "");

  return `${url.origin}${normalizedPathname}${url.search}${url.hash}`;
}

loadEnvConfig(process.cwd());

const invitationEnv = {
  resendApiKey: readRequiredKey(process.env, "RESEND_API_KEY"),
  emailFrom: normalizeEmailAddress(
    readRequiredKey(process.env, "EMAIL_FROM"),
    "EMAIL_FROM",
  ),
  appBaseUrl: normalizeAppBaseUrl(readRequiredKey(process.env, "APP_BASE_URL")),
  resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET?.trim() || undefined,
};

console.log(
  JSON.stringify(
    {
      ok: true,
      appBaseUrl: invitationEnv.appBaseUrl,
      emailFrom: invitationEnv.emailFrom,
      hasWebhookSecret: Boolean(invitationEnv.resendWebhookSecret),
    },
    null,
    2,
  ),
);
