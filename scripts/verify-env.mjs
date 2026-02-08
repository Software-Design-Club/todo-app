import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

const projectDir = process.cwd();
loadEnvConfig(projectDir);

const requiredEnvVars = ["RESEND_API_KEY", "EMAIL_FROM", "APP_BASE_URL"];
const missingRequiredVars = requiredEnvVars.filter((envVarName) => {
  const envValue = process.env[envVarName];
  return !envValue || envValue.trim().length === 0;
});

if (missingRequiredVars.length > 0) {
  console.error(
    `Missing required environment variables: ${missingRequiredVars.join(", ")}`
  );
  process.exit(1);
}

try {
  const appBaseUrl = process.env.APP_BASE_URL;
  if (!appBaseUrl) {
    throw new Error("APP_BASE_URL is required");
  }
  new URL(appBaseUrl);
} catch {
  console.error("APP_BASE_URL must be a valid absolute URL");
  process.exit(1);
}

console.log(
  "Environment verification passed for email invitations (RESEND_API_KEY, EMAIL_FROM, APP_BASE_URL)."
);
