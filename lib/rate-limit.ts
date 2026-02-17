const windows = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
}): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = windows.get(params.key);

  if (!entry || now >= entry.resetAt) {
    windows.set(params.key, {
      count: 1,
      resetAt: now + params.windowMs,
    });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= params.limit) {
    return {
      allowed: false,
      retryAfterMs: entry.resetAt - now,
    };
  }

  entry.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

export function resetRateLimitWindows() {
  windows.clear();
}
