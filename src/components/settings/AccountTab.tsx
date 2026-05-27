import React, { useEffect, useState } from "react";
import type { PublicAuthUser } from "../../lib/auth";
import { fetchAuthConfig } from "../../lib/auth";
import { adminSourceLabel } from "../../lib/admin-source-labels";
import { InfoBanner, RoleBadge, Section } from "./settings-ui";

export function AccountTab({ user }: { user: PublicAuthUser }) {
  const [oidcEnabled, setOidcEnabled] = useState(false);

  useEffect(() => {
    fetchAuthConfig()
      .then((c) => setOidcEnabled(c.enabled))
      .catch(() => {});
  }, []);

  const displayName = user.name ?? user.email ?? "Signed in user";
  const groups = user.groups ?? [];

  return (
    <div>
      <Section title="Your profile" description="How you appear in OpsBlaze.">
        <div className="rounded-lg border border-border-subtle bg-surface-2 px-4 py-3 flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-full bg-gradient-to-br from-red-600 to-orange-500 flex items-center justify-center text-white text-sm font-semibold shrink-0"
            aria-hidden
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-100 truncate">{displayName}</p>
            {user.email && user.name && (
              <p className="text-xs text-gray-500 truncate mt-0.5">{user.email}</p>
            )}
            <div className="mt-2">
              <RoleBadge isAdmin={user.isAdmin} />
            </div>
          </div>
        </div>
      </Section>

      {oidcEnabled && (
        <Section
          title="Sign-in details"
          description="What OpsBlaze received from your identity provider (useful when testing SSO)."
        >
          <dl className="rounded-lg border border-border-subtle bg-surface-2 divide-y divide-border-subtle/60 text-xs">
            <div className="px-3 py-2.5 flex gap-3">
              <dt className="text-gray-500 shrink-0 w-24">User id</dt>
              <dd className="text-gray-300 font-mono break-all">{user.id}</dd>
            </div>
            {user.email && (
              <div className="px-3 py-2.5 flex gap-3">
                <dt className="text-gray-500 shrink-0 w-24">Email</dt>
                <dd className="text-gray-300 break-all">{user.email}</dd>
              </div>
            )}
            <div className="px-3 py-2.5 flex gap-3">
              <dt className="text-gray-500 shrink-0 w-24">Admin</dt>
              <dd className="text-gray-300">
                {adminSourceLabel(user.adminSource, user.matchedAdminGroup)}
              </dd>
            </div>
            <div className="px-3 py-2.5">
              <dt className="text-gray-500 mb-1.5">Groups from token</dt>
              <dd>
                {groups.length > 0 ? (
                  <ul className="flex flex-wrap gap-1">
                    {groups.map((g) => (
                      <li
                        key={g}
                        className="px-2 py-0.5 rounded-full bg-surface-3 border border-border-subtle text-gray-300 font-mono text-[11px]"
                      >
                        {g}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500 italic">
                    No groups in the ID token or UserInfo. If you use{" "}
                    <span className="text-gray-400">OPSBLAZE_OIDC_ADMIN_GROUPS</span>, confirm your
                    IdP sends <span className="font-mono text-gray-400">groups</span>,{" "}
                    <span className="font-mono text-gray-400">roles</span>, or{" "}
                    <span className="font-mono text-gray-400">memberOf</span> claims.
                  </p>
                )}
              </dd>
            </div>
          </dl>
          <InfoBanner variant="tip">
            Admin rights are evaluated at login. Sign out and sign in again after changing admin
            emails, groups, or <span className="text-gray-300">OPSBLAZE_OIDC_ALL_USERS_ADMIN</span>{" "}
            in <span className="font-mono text-gray-400">.env</span>.
          </InfoBanner>
        </Section>
      )}

      <Section title="Privacy" description="How your investigation data is stored.">
        <InfoBanner variant="tip">
          Saved investigations are stored only for your account. Other users cannot open or search
          your conversation history.
        </InfoBanner>
        {oidcEnabled && (
          <InfoBanner>
            You are signed in with your organization account. Sign out when you finish on a shared
            workstation.
          </InfoBanner>
        )}
      </Section>

      <Section title="Session" description="End your session on this browser.">
        <InfoBanner>
          Use <span className="text-gray-300">Sign out</span> in the account menu (top right) when
          you are done, especially on a shared workstation.
        </InfoBanner>
      </Section>
    </div>
  );
}
