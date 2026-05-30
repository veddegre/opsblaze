/**
 * Per-account failed-login throttle.
 *
 * Complements the IP-based rate limiter on `/auth/local/login`: that limiter
 * stops a single IP from flooding the endpoint, but a targeted account can
 * still be attacked from rotating IPs. This tracks consecutive failures per
 * username and temporarily locks the account after a threshold, regardless of
 * source IP. State is in-memory (single-process deployment) and bounded.
 */

const MAX_FAILURES = (() => {
  const raw = parseInt(process.env.OPSBLAZE_LOGIN_MAX_FAILURES ?? "", 10);
  return Number.isFinite(raw) && raw >= 1 ? raw : 5;
})();

const LOCKOUT_MS = (() => {
  const raw = parseInt(process.env.OPSBLAZE_LOGIN_LOCKOUT_MS ?? "", 10);
  return Number.isFinite(raw) && raw >= 1_000 ? raw : 15 * 60_000;
})();

const WINDOW_MS = (() => {
  const raw = parseInt(process.env.OPSBLAZE_LOGIN_FAILURE_WINDOW_MS ?? "", 10);
  return Number.isFinite(raw) && raw >= 1_000 ? raw : 15 * 60_000;
})();

// Cap distinct tracked accounts so a flood of random usernames can't exhaust memory.
const MAX_ENTRIES = 5_000;

interface Attempt {
  failures: number;
  windowStart: number;
  lockedUntil: number;
  lastActivity: number;
}

const attempts = new Map<string, Attempt>();

export interface LockStatus {
  locked: boolean;
  retryAfterSec: number;
}

export interface FailureResult extends LockStatus {
  /** True only on the attempt that crossed the threshold (lock transition). */
  justLocked: boolean;
  failures: number;
}

function prune(now: number): void {
  if (attempts.size <= MAX_ENTRIES) return;
  for (const [key, entry] of attempts) {
    if (entry.lockedUntil <= now && now - entry.lastActivity > WINDOW_MS) {
      attempts.delete(key);
    }
  }
  if (attempts.size <= MAX_ENTRIES) return;
  const oldestFirst = [...attempts.entries()].sort((a, b) => a[1].lastActivity - b[1].lastActivity);
  const toDrop = attempts.size - MAX_ENTRIES;
  for (let i = 0; i < toDrop; i++) attempts.delete(oldestFirst[i][0]);
}

/** Whether the account is currently locked (call before authenticating). */
export function checkLoginLockout(key: string, now = Date.now()): LockStatus {
  const entry = attempts.get(key);
  if (entry && entry.lockedUntil > now) {
    return { locked: true, retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1000) };
  }
  return { locked: false, retryAfterSec: 0 };
}

/** Record a failed attempt; returns the resulting lock state. */
export function recordLoginFailure(key: string, now = Date.now()): FailureResult {
  let entry = attempts.get(key);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    entry = { failures: 0, windowStart: now, lockedUntil: 0, lastActivity: now };
  }
  entry.failures += 1;
  entry.lastActivity = now;

  let justLocked = false;
  if (entry.failures >= MAX_FAILURES) {
    if (entry.lockedUntil <= now) justLocked = true;
    entry.lockedUntil = now + LOCKOUT_MS;
  }
  attempts.set(key, entry);
  prune(now);

  const locked = entry.lockedUntil > now;
  return {
    locked,
    justLocked,
    retryAfterSec: locked ? Math.ceil((entry.lockedUntil - now) / 1000) : 0,
    failures: entry.failures,
  };
}

/** Clear failure state after a successful login. */
export function recordLoginSuccess(key: string): void {
  attempts.delete(key);
}

/** Test helper: wipe all tracked state. */
export function resetLoginThrottle(): void {
  attempts.clear();
}

export const loginThrottleConfig = {
  maxFailures: MAX_FAILURES,
  lockoutMs: LOCKOUT_MS,
  windowMs: WINDOW_MS,
};
