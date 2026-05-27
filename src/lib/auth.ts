export type AuthMode = "oidc" | "local" | "open";

export type AdminSource =
  | "all_users_admin"
  | "admin_email"
  | "admin_group"
  | "admin_username"
  | "none"
  | "local_mode";

export interface PublicAuthUser {
  id: string;
  email?: string;
  name?: string;
  isAdmin: boolean;
  groups?: string[];
  adminSource?: AdminSource;
  matchedAdminGroup?: string;
}

export interface AuthConfig {
  mode: AuthMode;
  /** @deprecated Use `mode` — true when mode is oidc or local */
  enabled: boolean;
}

export interface AuthMeResponse {
  authenticated: boolean;
  user?: PublicAuthUser;
}

export async function fetchAuthConfig(): Promise<AuthConfig> {
  const res = await fetch("/api/auth/config", { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load auth config: ${res.status}`);
  return res.json();
}

export async function fetchAuthMe(): Promise<AuthMeResponse> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (res.status === 401) {
    return { authenticated: false };
  }
  if (!res.ok) throw new Error(`Failed to load session: ${res.status}`);
  return res.json();
}

export function loginRedirect(): void {
  window.location.href = "/api/auth/login";
}

export async function localLogin(username: string, password: string): Promise<PublicAuthUser> {
  const res = await fetch("/api/auth/local/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    user?: PublicAuthUser;
  };
  if (!res.ok) {
    throw new Error(data.error ?? `Login failed (${res.status})`);
  }
  if (!data.user) {
    throw new Error("Login succeeded but no user returned");
  }
  return data.user;
}

export async function logout(): Promise<void> {
  const res = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Logout failed: ${res.status}`);
}
