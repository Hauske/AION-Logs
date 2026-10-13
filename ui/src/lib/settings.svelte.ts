// Settings live in the backend's settings.json (string values) and are shared
// by every window: a change in one arrives in the others as `setting-changed`.

import { api, on } from "./api";

export const KEYS = {
  training: "aionLogs.trainingMode",
  /** Whose rows the meter shows: "me" | "party" | "all". */
  scope: "aionLogs.meterScope",
  opacity: "aionLogs.meterOpacity",
  width: "aionLogs.meterWidth",
  /** Encounters per page in the list: 10, 15 or 20. */
  perPage: "aionLogs.encountersPerPage",
  /** Training fights listed among the encounters. */
  showTraining: "aionLogs.showTrainingFights",
  /** Damage each buff adds, for rDPS: JSON, percent by buff key (see buffValues.ts). */
  buffValues: "aionLogs.buffValues",
  /** Global shortcuts, as labels like "Ctrl+Alt+R". */
  resetHotkey: "dpsMeter.hotkey",
  hideHotkey: "dpsMeter.toggleWindowHotkey",
} as const;

const DEFAULTS: Record<string, string> = {
  [KEYS.training]: "false",
  [KEYS.scope]: "party",
  [KEYS.opacity]: "85",
  [KEYS.width]: "500",
  [KEYS.perPage]: "20",
  [KEYS.showTraining]: "false",
  [KEYS.buffValues]: "{}",
  [KEYS.resetHotkey]: "Ctrl+Alt+R",
  [KEYS.hideHotkey]: "Ctrl+Alt+Up",
};

export const settings = $state<{ values: Record<string, string>; loaded: boolean }>({ values: {}, loaded: false });

export function getSetting(key: string): string {
  return settings.values[key] ?? DEFAULTS[key] ?? "";
}

export function getBool(key: string): boolean {
  return getSetting(key) === "true";
}

export function getNumber(key: string): number {
  return Number(getSetting(key)) || 0;
}

export function setSetting(key: string, value: string | number | boolean) {
  const v = String(value);
  settings.values[key] = v;
  api.setSetting(key, v);
}

let started = false;

export function startSettings(): Promise<void> {
  if (started) return Promise.resolve();
  started = true;
  on<{ key: string; value: string }>("setting-changed", ({ key, value }) => {
    settings.values[key] = value;
  });
  return api.settings().then((all) => {
    settings.values = { ...all, ...settings.values };
    settings.loaded = true;
  });
}
