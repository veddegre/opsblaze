import { Router } from "express";
import type { Request, Response } from "express";
import { logger } from "../logger.js";
import {
  buildLoginRedirectUrl,
  exchangeCallback,
  getOidcConfiguration,
  isOidcEnabled,
  loadOidcEnv,
  resolveAdmin,
} from "./oidc.js";
import { sanitizeUserId, toPublicUser, type AuthUser } from "./types.js";

export const authRouter = Router();

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
  res.json({ enabled: isOidcEnabled() });
});

authRouter.get("/me", (req, res) => {
  if (!isOidcEnabled()) {
    res.json({
      authenticated: true,
      user: toPublicUser({
        id: "local",
        name: "Local user",
        isAdmin: true,
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
    const email = profile.email?.toLowerCase();
    const user: AuthUser = {
      id: sanitizeUserId(profile.sub),
      email: profile.email,
      name: profile.name,
      isAdmin: resolveAdmin(env.adminEmails, email),
    };

    await regenerateSession(req);
    if (!req.session) {
      res.redirect("/?auth_error=session");
      return;
    }
    req.session.user = user;
    delete req.session.oidc;

    logger.info({ userId: user.id, email: user.email }, "user signed in");
    res.redirect("/");
  } catch (err) {
    logger.error({ err }, "OIDC callback failed");
    res.redirect("/?auth_error=callback");
  }
});

authRouter.post("/logout", (req, res) => {
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
    res.clearCookie("opsblaze.sid");
    finish();
  });
});

/** SPA entry after failed auth */
export function authErrorFromQuery(req: Request): string | null {
  const q = req.query.auth_error;
  return typeof q === "string" ? q : null;
}
