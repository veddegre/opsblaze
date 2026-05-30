import React, { useEffect, useState } from "react";
import { fetchHealth } from "../../lib/api";
import type { HealthResponse } from "../../lib/api";
import { getSettings } from "../../lib/settings-api";
import type { AppSettings } from "../../lib/settings-api";
import { InfoBanner, Section, StatusRow } from "./settings-ui";

export function AdminSystemTab() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(() => {});
    fetchHealth()
      .then(setHealth)
      .catch(() => {});
  }, []);

  const splunkCheck = health?.checks?.splunk;
  const llmCheck = health?.checks?.openwebui ?? health?.checks?.claude;
  const useOpenWebUi = settings?.system?.llmProvider === "openwebui";
  const llmLabel = useOpenWebUi ? "Open WebUI" : "Claude";

  if (!settings?.system) {
    return (
      <div className="px-4 py-6">
        <p className="text-sm text-gray-400">
          System configuration details are only visible to administrators.
        </p>
      </div>
    );
  }

  return (
    <div>
      <Section
        title="Service health"
        description="Live status of connections OpsBlaze uses to run investigations."
      >
        <StatusRow
          label="Splunk"
          detail={
            settings
              ? `${settings.system.splunkScheme}://${settings.system.splunkHost}:${settings.system.splunkPort}`
              : undefined
          }
          status={splunkCheck?.status ?? "error"}
          trailing={splunkCheck?.message ?? settings?.system.splunkAuthMethod}
        />
        <StatusRow
          label={llmLabel}
          status={llmCheck?.status ?? "error"}
          trailing={llmCheck?.message ?? settings?.system.claudeAuthMethod}
        />
        <StatusRow
          label="OpsBlaze server"
          detail={
            settings
              ? `Listening on ${settings.system.bindAddress}:${settings.system.serverPort}`
              : undefined
          }
          status="ok"
          trailing={settings?.system.serverMode}
        />
      </Section>

      <Section
        title="Environment configuration"
        description="Infrastructure settings are edited on the server, not in the browser."
      >
        <InfoBanner variant="tip">
          To change Splunk host, credentials, or LLM backend, update the{" "}
          <span className="font-mono">.env</span> file on the server host, then run{" "}
          <span className="font-mono">node bin/opsblaze.cjs restart</span>.
        </InfoBanner>
        {useOpenWebUi ? (
          <InfoBanner variant="tip">
            The active Open WebUI model is selected under{" "}
            <span className="text-gray-300">Settings → Runtime settings</span>. Connection URL and
            API key remain in <span className="font-mono">.env</span>.
          </InfoBanner>
        ) : (
          <InfoBanner>
            To use Open WebUI instead of Claude, set{" "}
            <span className="font-mono">OPENWEBUI_BASE_URL</span> and{" "}
            <span className="font-mono">OPENWEBUI_API_KEY</span> in{" "}
            <span className="font-mono">.env</span>.
          </InfoBanner>
        )}
      </Section>
    </div>
  );
}
