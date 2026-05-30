import { describe, it, expect, beforeEach } from "vitest";
import {
  checkLoginLockout,
  recordLoginFailure,
  recordLoginSuccess,
  resetLoginThrottle,
  loginThrottleConfig,
} from "../auth/login-throttle.js";

const { maxFailures, lockoutMs, windowMs } = loginThrottleConfig;

beforeEach(() => {
  resetLoginThrottle();
});

describe("login-throttle", () => {
  it("does not lock below the failure threshold", () => {
    const now = 1_000_000;
    for (let i = 1; i < maxFailures; i++) {
      const r = recordLoginFailure("alice", now);
      expect(r.locked).toBe(false);
      expect(r.failures).toBe(i);
    }
    expect(checkLoginLockout("alice", now).locked).toBe(false);
  });

  it("locks once the threshold is reached and flags the transition", () => {
    const now = 2_000_000;
    let last;
    for (let i = 0; i < maxFailures; i++) {
      last = recordLoginFailure("bob", now);
    }
    expect(last!.locked).toBe(true);
    expect(last!.justLocked).toBe(true);
    expect(last!.retryAfterSec).toBe(Math.ceil(lockoutMs / 1000));

    const status = checkLoginLockout("bob", now);
    expect(status.locked).toBe(true);
    expect(status.retryAfterSec).toBeGreaterThan(0);
  });

  it("does not re-flag justLocked on further failures during a lock", () => {
    const now = 3_000_000;
    for (let i = 0; i < maxFailures; i++) recordLoginFailure("carol", now);
    const again = recordLoginFailure("carol", now + 1_000);
    expect(again.locked).toBe(true);
    expect(again.justLocked).toBe(false);
  });

  it("unlocks after the lockout window elapses", () => {
    const now = 4_000_000;
    for (let i = 0; i < maxFailures; i++) recordLoginFailure("dave", now);
    expect(checkLoginLockout("dave", now).locked).toBe(true);
    expect(checkLoginLockout("dave", now + lockoutMs + 1).locked).toBe(false);
  });

  it("resets the failure count after the failure window passes", () => {
    const now = 5_000_000;
    recordLoginFailure("erin", now);
    recordLoginFailure("erin", now);
    const afterWindow = recordLoginFailure("erin", now + windowMs + 1);
    expect(afterWindow.failures).toBe(1);
    expect(afterWindow.locked).toBe(false);
  });

  it("clears state on success", () => {
    const now = 6_000_000;
    recordLoginFailure("frank", now);
    recordLoginFailure("frank", now);
    recordLoginSuccess("frank");
    expect(recordLoginFailure("frank", now).failures).toBe(1);
  });
});
