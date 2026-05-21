import React, { useEffect, useState } from "react";
import {
  fetchAuthConfig,
  fetchAuthMe,
  loginRedirect,
  type PublicAuthUser,
} from "../lib/auth";

interface AuthGateProps {
  children: (user: PublicAuthUser) => React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const [loading, setLoading] = useState(true);
  const [oidcEnabled, setOidcEnabled] = useState(false);
  const [user, setUser] = useState<PublicAuthUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("auth_error");
    if (err) {
      setAuthError(err === "callback" ? "Sign-in failed. Try again." : "Sign-in session expired.");
      window.history.replaceState({}, "", window.location.pathname);
    }

    (async () => {
      try {
        const config = await fetchAuthConfig();
        setOidcEnabled(config.enabled);
        if (!config.enabled) {
          setUser({ id: "local", name: "Local user", isAdmin: true });
          setLoading(false);
          return;
        }
        const me = await fetchAuthMe();
        if (me.authenticated && me.user) {
          setUser(me.user);
        }
      } catch {
        setAuthError("Could not reach the server.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-surface-0 gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-600 to-orange-500 animate-pulse" />
        <p className="text-sm text-gray-500">Loading OpsBlaze…</p>
      </div>
    );
  }

  if (oidcEnabled && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0 px-6 py-12">
        <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-surface-1 p-8 shadow-xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-600 to-orange-500 flex items-center justify-center shrink-0">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                className="opacity-90"
                aria-hidden
              >
                <circle cx="10" cy="10" r="7" />
                <line x1="15" y1="15" x2="21" y2="21" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-100">OpsBlaze</h1>
              <p className="text-xs text-gray-500">Splunk narrative investigations</p>
            </div>
          </div>

          <p className="text-sm text-gray-400 leading-relaxed mb-6">
            Sign in with your organization account to ask questions about Splunk data. Your saved
            investigations stay private to you.
          </p>

          <ul className="text-xs text-gray-500 space-y-2 mb-6 list-disc pl-4">
            <li>Natural language queries with charts and narrative analysis</li>
            <li>Private conversation history per user</li>
            <li>Optional investigation skills for focused analysis</li>
          </ul>

          {authError && (
            <p className="text-sm text-red-400 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
              {authError}
            </p>
          )}

          <button
            type="button"
            onClick={() => loginRedirect()}
            className="w-full py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Sign in with your organization
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-0 px-6">
        <p className="text-sm text-red-400 text-center max-w-sm">
          Authentication is unavailable. Check that the server is running and OIDC is configured
          correctly.
        </p>
      </div>
    );
  }

  return <>{children(user)}</>;
}
