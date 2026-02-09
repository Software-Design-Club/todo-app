export function sanitizeRedirectTarget(redirectTo?: string): string {
  if (!redirectTo) {
    return "/";
  }

  if (!redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
    return "/";
  }

  return redirectTo;
}

export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) {
    return false;
  }

  const atIndex = trimmed.indexOf("@");
  if (atIndex < 1 || atIndex === trimmed.length - 1) {
    return false;
  }

  const domain = trimmed.slice(atIndex + 1);
  if (!domain.includes(".")) {
    return false;
  }

  return true;
}
