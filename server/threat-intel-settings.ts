import { z } from "zod";
import { loadRuntimeSettings } from "./runtime-settings.js";

export const threatIntelSettingsSchema = z.object({
  internalCidrs: z.array(z.string().max(64)).max(200).optional(),
});

export type ThreatIntelSettings = z.infer<typeof threatIntelSettingsSchema>;

export async function getThreatIntelSettings(): Promise<ThreatIntelSettings> {
  const settings = await loadRuntimeSettings();
  return settings.threatIntel ?? {};
}
