import React from "react";
import type { PublicAuthUser } from "../../lib/auth";
import { fetchAuthConfig } from "../../lib/auth";
import { useEffect, useState } from "react";
import { InfoBanner, RoleBadge, Section } from "./settings-ui";

export function AccountTab({ user }: { user: PublicAuthUser }) {
  const [oidcEnabled, setOidcEnabled] = useState(false);

  useEffect(() => {
    fetchAuthConfig()
      .then((c) => setOidcEnabled(c.enabled))
      .catch(() => {});
  }, []);

  const displayName = user.name ?? user.email ?? "Signed in user";

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
