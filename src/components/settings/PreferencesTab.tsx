import React, { useEffect, useMemo, useState } from "react";
import {
  fetchOpenWebUiModels,
  getSettings,
  updateSettings,
  type OpenWebUiModelOption,
} from "../../lib/settings-api";
import type { AppSettings } from "../../lib/settings-api";
import { formatStringList, parseStringList } from "../../lib/redaction-utils";
import { FieldLabel, InfoBanner, Section, inputClass, monoInputClass } from "./settings-ui";
import type { SplunkGuardrails, ThreatIntelSettings } from "../../lib/settings-api";
import {
  formatIpZonesText,
  parseIpZonesText,
  zonesFromLegacyInternalCidrs,
} from "../../lib/ip-zones-format";

export function PreferencesTab({ isAdmin }: { isAdmin: boolean }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [maxTurns, setMaxTurns] = useState(30);
  const [streamTimeout, setStreamTimeout] = useState(300000);
  const [redactApplyOnExport, setRedactApplyOnExport] = useState(false);
  const [redactEmail, setRedactEmail] = useState(true);
  const [redactIpv4, setRedactIpv4] = useState(true);
  const [redactMac, setRedactMac] = useState(false);
  const [redactCustomStrings, setRedactCustomStrings] = useState("");
  const [redactCustomPatterns, setRedactCustomPatterns] = useState("");
  const [splunkIndexes, setSplunkIndexes] = useState("");
  const [splunkMaxHours, setSplunkMaxHours] = useState(168);
  const [threatIntelZonesText, setThreatIntelZonesText] = useState("");
  const [tiEnabled, setTiEnabled] = useState(true);
  const [tiVtEnabled, setTiVtEnabled] = useState(false);
  const [tiAbuseEnabled, setTiAbuseEnabled] = useState(false);
  const [tiMaxIps, setTiMaxIps] = useState(25);
  const [tiCacheHours, setTiCacheHours] = useState(24);
  const [tiAbuseMaxAge, setTiAbuseMaxAge] = useState(90);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openWebUiModels, setOpenWebUiModels] = useState<OpenWebUiModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const useOpenWebUi =
    settings?.runtime.llmProvider === "openwebui" || settings?.system?.llmProvider === "openwebui";

  useEffect(() => {
    getSettings()
      .then((s) => {
        setSettings(s);
        setModel(s.runtime.claudeModel);
        setEffort(s.runtime.claudeEffort);
        setMaxTurns(s.runtime.maxTurns);
        setStreamTimeout(s.runtime.streamTimeoutMs);
        const r = s.runtime.redaction;
        setRedactApplyOnExport(Boolean(r?.applyOnExport));
        setRedactEmail(r?.builtin?.email !== false);
        setRedactIpv4(r?.builtin?.ipv4 !== false);
        setRedactMac(Boolean(r?.builtin?.mac));
        setRedactCustomStrings(formatStringList(r?.customStrings));
        setRedactCustomPatterns(formatStringList(r?.customPatterns));
        const g = s.runtime.splunkGuardrails;
        setSplunkIndexes(formatStringList(g?.allowedIndexes));
        setSplunkMaxHours(g?.maxTimeRangeHours ?? 168);
        const ti = s.runtime.threatIntel;
        const zonesText = ti?.zones?.length
          ? formatIpZonesText(ti.zones)
          : formatIpZonesText(zonesFromLegacyInternalCidrs(ti?.internalCidrs));
        setThreatIntelZonesText(zonesText);
        const tiStatus = s.system?.threatIntelStatus;
        setTiEnabled(ti?.enabled ?? tiStatus?.masterEnabled ?? true);
        setTiVtEnabled(ti?.virustotalEnabled ?? tiStatus?.virustotal.active ?? false);
        setTiAbuseEnabled(ti?.abuseipdbEnabled ?? tiStatus?.abuseipdb.active ?? false);
        setTiMaxIps(ti?.maxIps ?? tiStatus?.maxIps ?? 25);
        setTiCacheHours(ti?.cacheHours ?? tiStatus?.cacheHours ?? 24);
        setTiAbuseMaxAge(ti?.abuseipdbMaxAgeDays ?? tiStatus?.abuseipdbMaxAgeDays ?? 90);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!useOpenWebUi) {
      setOpenWebUiModels([]);
      setModelsError(null);
      setModelsLoading(false);
      return;
    }

    let cancelled = false;
    setModelsLoading(true);
    setModelsError(null);

    fetchOpenWebUiModels()
      .then((models) => {
        if (!cancelled) setOpenWebUiModels(models);
      })
      .catch((err) => {
        if (!cancelled) {
          setOpenWebUiModels([]);
          setModelsError((err as Error).message);
        }
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [useOpenWebUi]);

  const modelOptions = useMemo(() => {
    const opts = [...openWebUiModels];
    if (model && !opts.some((o) => o.id === model)) {
      opts.unshift({ id: model, label: model });
    }
    return opts;
  }, [openWebUiModels, model]);

  const handleSave = async () => {
    if (!isAdmin) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const partial: Record<string, unknown> = {};
      if (model !== settings?.runtime.claudeModel) partial.claudeModel = model;
      if (effort !== settings?.runtime.claudeEffort) partial.claudeEffort = effort;
      if (maxTurns !== settings?.runtime.maxTurns) partial.maxTurns = maxTurns;
      if (streamTimeout !== settings?.runtime.streamTimeoutMs)
        partial.streamTimeoutMs = streamTimeout;

      const nextRedaction = {
        applyOnExport: redactApplyOnExport,
        builtin: { email: redactEmail, ipv4: redactIpv4, mac: redactMac },
        customStrings: parseStringList(redactCustomStrings),
        customPatterns: parseStringList(redactCustomPatterns),
      };
      // If the server has no redaction settings yet, treat it as "defaults" so
      // clicking save without changes doesn't trigger a PATCH.
      const prevR = settings?.runtime.redaction;
      const prevRedaction = prevR ?? {
        applyOnExport: false,
        builtin: { email: true, ipv4: true, mac: false },
        customStrings: [],
        customPatterns: [],
      };
      const redactionChanged =
        prevRedaction.applyOnExport !== nextRedaction.applyOnExport ||
        prevRedaction.builtin?.email !== nextRedaction.builtin.email ||
        prevRedaction.builtin?.ipv4 !== nextRedaction.builtin.ipv4 ||
        prevRedaction.builtin?.mac !== nextRedaction.builtin.mac ||
        formatStringList(prevRedaction.customStrings) !== redactCustomStrings.trim() ||
        formatStringList(prevRedaction.customPatterns) !== redactCustomPatterns.trim();
      if (redactionChanged) partial.redaction = nextRedaction;

      const nextGuardrails: SplunkGuardrails = {
        allowedIndexes: parseStringList(splunkIndexes),
        maxTimeRangeHours: splunkMaxHours,
      };
      const prevG = settings?.runtime.splunkGuardrails ?? {
        allowedIndexes: [],
        maxTimeRangeHours: 168,
      };
      const guardrailsChanged =
        formatStringList(prevG.allowedIndexes) !== splunkIndexes.trim() ||
        (prevG.maxTimeRangeHours ?? 168) !== splunkMaxHours;
      if (guardrailsChanged) partial.splunkGuardrails = nextGuardrails;

      const nextZones = parseIpZonesText(threatIntelZonesText);
      const prevTi = settings?.runtime.threatIntel;
      const tiStatus = settings?.system?.threatIntelStatus;
      const prevZonesText = prevTi?.zones?.length
        ? formatIpZonesText(prevTi.zones)
        : formatIpZonesText(zonesFromLegacyInternalCidrs(prevTi?.internalCidrs));

      // Build a minimal threatIntel patch: the server shallow-merges it into the
      // stored object, so untouched fields (e.g. zones) are preserved.
      const tiPartial: Partial<ThreatIntelSettings> = {};
      if (prevZonesText.trim() !== threatIntelZonesText.trim()) {
        tiPartial.zones = nextZones.length > 0 ? nextZones : undefined;
        tiPartial.internalCidrs = undefined;
      }
      const initEnabled = prevTi?.enabled ?? tiStatus?.masterEnabled ?? true;
      if (tiEnabled !== initEnabled) tiPartial.enabled = tiEnabled;
      const initVt = prevTi?.virustotalEnabled ?? tiStatus?.virustotal.active ?? false;
      if (tiVtEnabled !== initVt) tiPartial.virustotalEnabled = tiVtEnabled;
      const initAbuse = prevTi?.abuseipdbEnabled ?? tiStatus?.abuseipdb.active ?? false;
      if (tiAbuseEnabled !== initAbuse) tiPartial.abuseipdbEnabled = tiAbuseEnabled;
      const initMaxIps = prevTi?.maxIps ?? tiStatus?.maxIps ?? 25;
      if (tiMaxIps !== initMaxIps) tiPartial.maxIps = tiMaxIps;
      const initCacheHours = prevTi?.cacheHours ?? tiStatus?.cacheHours ?? 24;
      if (tiCacheHours !== initCacheHours) tiPartial.cacheHours = tiCacheHours;
      const initAbuseMaxAge = prevTi?.abuseipdbMaxAgeDays ?? tiStatus?.abuseipdbMaxAgeDays ?? 90;
      if (tiAbuseMaxAge !== initAbuseMaxAge) tiPartial.abuseipdbMaxAgeDays = tiAbuseMaxAge;

      if (Object.keys(tiPartial).length > 0) partial.threatIntel = tiPartial;

      if (Object.keys(partial).length === 0) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        return;
      }
      const updated = await updateSettings(partial);
      setSettings((prev) => (prev ? { ...prev, runtime: updated.runtime } : prev));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const modelField = useOpenWebUi ? (
    <>
      {modelsError && (
        <InfoBanner>
          Could not load models from Open WebUI ({modelsError}). Check server connectivity and API
          key, or type a model ID manually below.
        </InfoBanner>
      )}
      {modelsLoading ? (
        <p className="text-xs text-gray-500 py-1">Loading models from Open WebUI…</p>
      ) : modelOptions.length > 0 ? (
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={!isAdmin}
          className={inputClass}
        >
          {!model && (
            <option value="" disabled>
              Select a model…
            </option>
          )}
          {modelOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label === m.id ? m.id : `${m.label} (${m.id})`}
            </option>
          ))}
        </select>
      ) : (
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={!isAdmin}
          placeholder="e.g. gemma4:31b"
          className={monoInputClass}
        />
      )}
      {!modelsLoading && modelOptions.length > 0 && (
        <p className="text-[11px] text-gray-600">
          {modelOptions.length} model{modelOptions.length !== 1 ? "s" : ""} from your Open WebUI
          instance. Changes apply on the next investigation.
        </p>
      )}
    </>
  ) : (
    <input
      value={model}
      onChange={(e) => setModel(e.target.value)}
      disabled={!isAdmin}
      placeholder="claude-opus-4-6"
      className={monoInputClass}
    />
  );

  return (
    <div>
      <Section
        title="Runtime settings"
        description={
          isAdmin
            ? "Defaults for new investigations on this server. Changes take effect on the next message."
            : "Current runtime defaults (configured by an administrator)."
        }
      >
        {!isAdmin && (
          <InfoBanner>
            Contact an administrator if you need a different model, timeout, or turn limit.
          </InfoBanner>
        )}

        <FieldLabel
          hint={
            useOpenWebUi
              ? "Model from your Open WebUI instance (loaded automatically when available)."
              : "Which Claude model powers investigations."
          }
        >
          {useOpenWebUi ? "Open WebUI model" : "Claude model"}
        </FieldLabel>
        {modelField}

        {!useOpenWebUi && (
          <>
            <FieldLabel hint="Higher effort uses more reasoning before answering.">
              Thinking effort
            </FieldLabel>
            <select
              value={effort}
              onChange={(e) => setEffort(e.target.value)}
              disabled={!isAdmin}
              className={inputClass}
            >
              <option value="low">Low — faster, lighter analysis</option>
              <option value="medium">Medium</option>
              <option value="high">High — recommended</option>
              <option value="max">Max — deepest reasoning</option>
            </select>
          </>
        )}

        <FieldLabel hint="How many back-and-forth tool steps the agent may take per question.">
          Max steps per investigation
        </FieldLabel>
        <input
          type="number"
          value={maxTurns}
          onChange={(e) => setMaxTurns(Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))}
          disabled={!isAdmin}
          min={1}
          max={200}
          className={inputClass}
        />

        <FieldLabel hint="Investigations stop automatically after this duration.">
          Time limit
        </FieldLabel>
        <select
          value={streamTimeout}
          onChange={(e) => setStreamTimeout(parseInt(e.target.value))}
          disabled={!isAdmin}
          className={inputClass}
        >
          <option value={120000}>2 minutes</option>
          <option value={300000}>5 minutes</option>
          <option value={600000}>10 minutes</option>
          <option value={900000}>15 minutes</option>
          <option value={1800000}>30 minutes</option>
        </select>

        <div className="border-t border-border-subtle pt-4 mt-2 space-y-3">
          <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
            Export redaction
          </h3>
          <p className="text-[11px] text-gray-600 -mt-1">
            Replace sensitive values with [REDACTED] in downloaded HTML reports. Investigators can
            add per-investigation terms from the export menu.
          </p>
          <label className="flex items-center gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={redactApplyOnExport}
              onChange={(e) => setRedactApplyOnExport(e.target.checked)}
              disabled={!isAdmin}
              className="rounded border-border-subtle"
            />
            Redact on every export by default
          </label>
          <div className="flex flex-wrap gap-4 text-xs text-gray-300">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={redactEmail}
                onChange={(e) => setRedactEmail(e.target.checked)}
                disabled={!isAdmin}
                className="rounded border-border-subtle"
              />
              Email addresses
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={redactIpv4}
                onChange={(e) => setRedactIpv4(e.target.checked)}
                disabled={!isAdmin}
                className="rounded border-border-subtle"
              />
              IPv4 addresses
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={redactMac}
                onChange={(e) => setRedactMac(e.target.checked)}
                disabled={!isAdmin}
                className="rounded border-border-subtle"
              />
              MAC addresses
            </label>
          </div>
          <FieldLabel hint="One hostname, username, or phrase per line. Case-insensitive.">
            Global redaction terms
          </FieldLabel>
          <textarea
            value={redactCustomStrings}
            onChange={(e) => setRedactCustomStrings(e.target.value)}
            disabled={!isAdmin}
            rows={4}
            placeholder={"splunk-sh1.example.edu\ninternal.example.com"}
            className={`${monoInputClass} resize-y min-h-[4rem]`}
          />
          <FieldLabel hint="Optional. One JavaScript regex per line (advanced).">
            Custom regex patterns
          </FieldLabel>
          <textarea
            value={redactCustomPatterns}
            onChange={(e) => setRedactCustomPatterns(e.target.value)}
            disabled={!isAdmin}
            rows={2}
            placeholder={"\\bINC\\d{7}\\b"}
            className={`${monoInputClass} resize-y min-h-[2.5rem]`}
          />
        </div>

        <div className="border-t border-border-subtle pt-4 mt-2 space-y-3">
          <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
            Threat intelligence
          </h3>
          <p className="text-[11px] text-gray-600 -mt-1">
            Named zones drive <span className="font-mono">classify_organization_ips</span> and skip
            threat-intel API calls for matching addresses. Use the{" "}
            <span className="font-mono">ip-context-risk</span> skill for activity-based risk
            adjustments. Env fallback:{" "}
            <span className="font-mono">THREAT_INTEL_INTERNAL_CIDRS</span> (zone{" "}
            <span className="font-mono">env</span>, neutral).
          </p>

          <label className="flex items-center gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={tiEnabled}
              onChange={(e) => setTiEnabled(e.target.checked)}
              disabled={!isAdmin}
              className="rounded border-border-subtle"
            />
            Enable threat-intel lookups (master switch)
          </label>

          <div className="flex flex-wrap gap-4 text-xs text-gray-300">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={tiVtEnabled}
                onChange={(e) => setTiVtEnabled(e.target.checked)}
                disabled={!isAdmin || !settings?.system?.threatIntelStatus?.virustotal.keyPresent}
                className="rounded border-border-subtle"
              />
              VirusTotal
              {settings?.system?.threatIntelStatus &&
                !settings.system.threatIntelStatus.virustotal.keyPresent && (
                  <span className="text-[10px] text-gray-600">(no API key in .env)</span>
                )}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={tiAbuseEnabled}
                onChange={(e) => setTiAbuseEnabled(e.target.checked)}
                disabled={!isAdmin || !settings?.system?.threatIntelStatus?.abuseipdb.keyPresent}
                className="rounded border-border-subtle"
              />
              AbuseIPDB
              {settings?.system?.threatIntelStatus &&
                !settings.system.threatIntelStatus.abuseipdb.keyPresent && (
                  <span className="text-[10px] text-gray-600">(no API key in .env)</span>
                )}
            </label>
          </div>
          <p className="text-[10px] text-gray-600 -mt-1">
            API keys stay in <span className="font-mono">.env</span>. Turning a provider on here
            only takes effect for lookups; if it was off at startup, restart the server to register
            the <span className="font-mono">enrich_ips</span> tool.
          </p>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <FieldLabel hint="Per enrich call">Max IPs</FieldLabel>
              <input
                type="number"
                value={tiMaxIps}
                onChange={(e) =>
                  setTiMaxIps(Math.max(1, Math.min(100, parseInt(e.target.value) || 25)))
                }
                disabled={!isAdmin}
                min={1}
                max={100}
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel hint="Cache TTL (hrs)">Cache hours</FieldLabel>
              <input
                type="number"
                value={tiCacheHours}
                onChange={(e) =>
                  setTiCacheHours(Math.max(1, Math.min(168, parseInt(e.target.value) || 24)))
                }
                disabled={!isAdmin}
                min={1}
                max={168}
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel hint="AbuseIPDB window">Max age (days)</FieldLabel>
              <input
                type="number"
                value={tiAbuseMaxAge}
                onChange={(e) =>
                  setTiAbuseMaxAge(Math.max(1, Math.min(365, parseInt(e.target.value) || 90)))
                }
                disabled={!isAdmin}
                min={1}
                max={365}
                className={inputClass}
              />
            </div>
          </div>

          <FieldLabel hint="Zone header: name posture (trusted | neutral | sensitive). Following lines are CIDRs until the next header.">
            IP zones
          </FieldLabel>
          <textarea
            value={threatIntelZonesText}
            onChange={(e) => setThreatIntelZonesText(e.target.value)}
            disabled={!isAdmin}
            rows={8}
            placeholder={
              "campus trusted\n203.0.113.0/24\n198.51.100.0/22\n\nvpn neutral\n10.8.0.0/24"
            }
            className={`${monoInputClass} resize-y min-h-[6rem]`}
          />
        </div>

        <div className="border-t border-border-subtle pt-4 mt-2 space-y-3">
          <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
            Splunk guardrails
          </h3>
          <p className="text-[11px] text-gray-600 -mt-1">
            Block MCP <span className="font-mono">splunk_query</span> calls that violate index or
            time-window policy. Applies to all investigators; admins may get extra indexes or a
            break-glass bypass via server environment variables (see System health).
          </p>
          {isAdmin && settings?.system?.splunkGuardrailsAdmin && (
            <InfoBanner>
              <span className="font-medium text-gray-300">Admin break-glass (from .env):</span>{" "}
              {settings.system.splunkGuardrailsAdmin.bypassIndexes
                ? "index allowlist bypass is ON for administrators (time window still enforced)."
                : settings.system.splunkGuardrailsAdmin.extraIndexes.length > 0
                  ? `extra indexes for admins: ${settings.system.splunkGuardrailsAdmin.extraIndexes.join(", ")}.`
                  : "no admin index override configured."}
            </InfoBanner>
          )}
          <FieldLabel hint="One index name per line. Leave empty to allow any index.">
            Allowed indexes
          </FieldLabel>
          <textarea
            value={splunkIndexes}
            onChange={(e) => setSplunkIndexes(e.target.value)}
            disabled={!isAdmin}
            rows={3}
            placeholder={"main\nsecurity"}
            className={`${monoInputClass} resize-y min-h-[3rem]`}
          />
          <FieldLabel hint="Maximum earliest→latest window in hours (default 168 = 7 days).">
            Max time range (hours)
          </FieldLabel>
          <input
            type="number"
            value={splunkMaxHours}
            onChange={(e) =>
              setSplunkMaxHours(Math.max(1, Math.min(8760, parseInt(e.target.value) || 168)))
            }
            disabled={!isAdmin}
            min={1}
            max={8760}
            className={inputClass}
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        {isAdmin && (
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || (useOpenWebUi && !model)}
              className="text-sm px-4 py-2 rounded-lg bg-accent text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save runtime settings"}
            </button>
            {saved && <span className="text-xs text-green-400">Saved</span>}
          </div>
        )}
      </Section>
    </div>
  );
}
