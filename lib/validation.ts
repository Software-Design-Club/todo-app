export function sanitizeRedirectTarget(redirectTo?: string): string {
  if (!redirectTo) {
    return "/";
  }

  try {
    const url = new URL(redirectTo, "http://localhost");
    if (url.protocol !== "http:" || url.hostname !== "localhost") {
      return "/";
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed);
}
