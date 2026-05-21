export interface PublicAuthUser {
  id: string;
  email?: string;
  name?: string;
  isAdmin: boolean;
}

export interface AuthConfig {
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

export async function logout(): Promise<void> {
  const res = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Logout failed: ${res.status}`);
}
