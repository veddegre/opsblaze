import { Router } from "express";
import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { logger } from "../logger.js";
import {
  buildLoginRedirectUrl,
  exchangeCallback,
  getOidcConfiguration,
  loadOidcEnv,
  resolveAdminAccess,
} from "./oidc.js";
import { authenticateLocalUser, isLocalAuthEnabled } from "./local-auth.js";
import { getAuthMode } from "./mode.js";
import { sanitizeUserId, toPublicUser, type AuthUser } from "./types.js";
import { recordAudit } from "../audit-log.js";
import { rateLimitKey } from "../rate-limit-key.js";

export const authRouter = Router();

const localLoginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 15,
  keyGenerator: rateLimitKey,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in a minute." },
});

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!req.session) {
      resolve();
      return;
    }
    req.session.regenerate((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/** Build the OAuth callback URL from configured redirect URI + incoming query string. */
function buildCallbackUrl(req: Request, redirectUri: string): URL {
  const callbackUrl = new URL(redirectUri);
  const queryStart = req.originalUrl.indexOf("?");
  if (queryStart !== -1) {
    callbackUrl.search = req.originalUrl.slice(queryStart);
  }
  return callbackUrl;
}

authRouter.get("/config", (_req, res) => {
  const mode = getAuthMode();
  res.json({
    mode,
    enabled: mode !== "open",
  });
});

authRouter.get("/me", (req, res) => {
  const mode = getAuthMode();

  if (mode === "open") {
    res.json({
      authenticated: true,
      user: toPublicUser({
        id: "local",
        name: "Local user",
        isAdmin: true,
        groups: [],
        adminSource: "local_mode",
      }),
    });
    return;
  }

  const user = req.session?.user as AuthUser | undefined;
  if (!user) {
    res.status(401).json({ authenticated: false });
    return;
  }
  res.json({ authenticated: true, user: toPublicUser(user) });
});

authRouter.post("/local/login", localLoginLimiter, async (req, res) => {
  if (!isLocalAuthEnabled()) {
    res.status(404).json({ error: "Local authentication is not configured" });
    return;
  }

  const { username, password } = req.body as { username?: string; password?: string };
  if (!username?.trim() || typeof password !== "string" || !password) {
    res.status(400).json({ error: "username and password are required" });
    return;
  }

  try {
    const user = await authenticateLocalUser(username, password);
    if (!user) {
      void recordAudit(username.trim().toLowerCase() || "unknown", "auth.login.failed", {
        method: "local",
      });
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    await regenerateSession(req);
    if (!req.session) {
      res.status(500).json({ error: "Session not available" });
      return;
    }
    req.session.user = user;

    logger.info(
      {
        userId: user.id,
        username: username.trim().toLowerCase(),
        isAdmin: user.isAdmin,
        groups: user.groups,
      },
      "local user signed in"
    );
    void recordAudit(user.id, "auth.login", {
      method: "local",
      isAdmin: user.isAdmin,
      groups: user.groups,
    });

    res.json({ ok: true, user: toPublicUser(user) });
  } catch (err) {
    logger.error({ err }, "local login failed");
    res.status(500).json({ error: "Login failed" });
  }
});

authRouter.get("/login", async (req, res) => {
  const env = loadOidcEnv();
  if (!env) {
    res.status(503).json({ error: "OIDC is not configured" });
    return;
  }

  try {
    const config = await getOidcConfiguration();
    if (!req.session) {
      res.status(500).json({ error: "Session not available" });
      return;
    }
    req.session.oidc = { codeVerifier: "" };
    const href = await buildLoginRedirectUrl(config, env, req.session.oidc);
    res.redirect(href);
  } catch (err) {
    logger.error({ err }, "OIDC login redirect failed");
    res.status(500).json({ error: "Failed to start login" });
  }
});

authRouter.get("/callback", async (req, res) => {
  const env = loadOidcEnv();
  if (!env || !req.session?.oidc?.codeVerifier) {
    res.redirect("/?auth_error=session");
    return;
  }

  try {
    const config = await getOidcConfiguration();
    const callbackUrl = buildCallbackUrl(req, env.redirectUri);

    const profile = await exchangeCallback(config, callbackUrl, req.session.oidc);
    const admin = resolveAdminAccess(env, {
      email: profile.email,
      groups: profile.groups,
    });
    const user: AuthUser = {
      id: sanitizeUserId(profile.sub),
      email: profile.email,
      name: profile.name,
      isAdmin: admin.isAdmin,
      groups: profile.groups,
      adminSource: admin.source,
      matchedAdminGroup: admin.matchedAdminGroup,
    };

    await regenerateSession(req);
    if (!req.session) {
      res.redirect("/?auth_error=session");
      return;
    }
    req.session.user = user;
    delete req.session.oidc;

    logger.info(
      { userId: user.id, email: user.email, isAdmin: user.isAdmin, groups: profile.groups },
      "user signed in"
    );
    void recordAudit(user.id, "auth.login", { email: user.email, isAdmin: user.isAdmin });
    res.redirect("/");
  } catch (err) {
    logger.error({ err }, "OIDC callback failed");
    res.redirect("/?auth_error=callback");
  }
});

authRouter.post("/logout", (req, res) => {
  const userId = (req.session?.user as AuthUser | undefined)?.id;
  const finish = () => {
    res.json({ ok: true });
  };

  if (!req.session) {
    finish();
    return;
  }

  req.session.destroy((err) => {
    if (err) {
      logger.warn({ err }, "session destroy failed on logout");
    }
    if (userId) {
      void recordAudit(userId, "auth.logout");
    }
    res.clearCookie("opsblaze.sid");
    finish();
  });
});

/** SPA entry after failed auth */
export function authErrorFromQuery(req: Request): string | null {
  const q = req.query.auth_error;
  return typeof q === "string" ? q : null;
}
