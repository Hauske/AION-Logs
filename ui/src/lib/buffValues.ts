// How much damage each buff or debuff adds, in percent, for rDPS. The game
// does not send these and they grow with the skill's level, so they are the
// player's to set (Party Buffs and Boss Debuffs tabs); what is here is only
// where they start.

import { getSetting, KEYS, setSetting } from "./settings.svelte";

/**
 * Level 1 tooltips of the global client (build 0.0.4387.0), by `buffKey`:
 * "PvE Damage Boost" for a buff, the enemy's "PvE Damage Tolerance" for a
 * debuff. A levelled skill gives more.
 */
export const DEFAULT_BUFF_VALUES: Record<string, number> = {
  f1819: 10.5, // Chanter: Undefeated Mantra
  f1741: 10.5, // Cleric: Light of Protection
  "boss:f1878": 5.4, // Chanter: Earth's Promise
  "boss:f1707": 5, // Cleric: Chain of Torment
  f1278: 5.5, // Templar: Fury
};

/** Of these only the highest applies when several are on (the tooltips say so). */
export const EXCLUSIVE_BUFFS: string[][] = [["f1819", "f1741"]];

function saved(): Record<string, number> {
  try {
    const parsed = JSON.parse(getSetting(KEYS.buffValues) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** The starting values with the player's own over them. */
export function buffValues(): Record<string, number> {
  return { ...DEFAULT_BUFF_VALUES, ...saved() };
}

/** `null` goes back to the starting value; 0 says it adds nothing. */
export function setBuffValue(key: string, value: number | null) {
  const own = saved();
  if (value == null) delete own[key];
  else own[key] = value;
  setSetting(KEYS.buffValues, JSON.stringify(own));
}
