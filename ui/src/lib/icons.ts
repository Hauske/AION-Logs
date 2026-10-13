// Skill and buff icons come from the game's CDN and are cached on disk through
// the backend. The URL rules are A2Tools' (public/src/js/skillIcons.js).

import { api } from "./api";

const BASE_URL = "https://assets.playnccdn.com/static-aion2-gamedata/resources";

const svg = (body: string, stroke: string) =>
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`,
  );

/** Basic attacks. */
export const SWORDS_ICON = svg(
  `<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/>`,
  "#c0c8d8",
);
/** Unknown skills. */
export const WAND_ICON = svg(
  `<path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/>`,
  "#8890a4",
);
const DOT_ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="#8890a4"/></svg>`,
  );

const CLASS_CODE_BY_PREFIX: Record<string, string> = {
  "11": "GL", "12": "TE", "13": "AS", "14": "RA", "15": "SO", "16": "EL", "17": "CL", "18": "CH", "19": "GT",
};

let skillIconMap: Record<string, string> = {};
let abnormalIcons: Record<string, { icon?: string }> = {};
let abnormalNames: Record<string, string> = {};

const loadJson = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));

/** Loaded once per window; icons resolved before this finishes use fallbacks. */
export const tablesReady: Promise<void> = Promise.all([
  loadJson("/data/skill_icons.json").then((j) => (skillIconMap = j)),
  loadJson("/data/abnormals.json").then((j) => (abnormalIcons = j?.abnormals ?? {})),
  loadJson("/i18n/abnormals/en.json").then((j) => (abnormalNames = j)),
]).then(() => {});

const normalize = (raw: number | string): string => {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length >= 8 ? digits.slice(0, 8) : digits.padEnd(8, "0");
};

const pad3 = (n: number) => String(Math.max(0, n || 0)).padStart(3, "0");

export function skillIconCandidates(rawCode: number | string): string[] {
  const code = normalize(rawCode);
  if (!code) return [SWORDS_ICON];

  // Theostones (godstones): 30xx q ii x
  if (code.startsWith("30") && code.length >= 7) {
    const iconCode = Number(code.slice(5, 7));
    if (iconCode > 0) {
      return [`${BASE_URL}/Icon_Item_Usable_Godstone_WP_r_${iconCode.toString(16).padStart(3, "0")}.png`, WAND_ICON];
    }
  }

  const prefix2 = code.slice(0, 2);
  if (prefix2 >= "11" && prefix2 <= "18" && code.slice(2, 6) === "0000" && code.slice(6) !== "00") return [SWORDS_ICON];
  if (code.startsWith("1000") || code.startsWith("1699")) return [SWORDS_ICON];

  const named = skillIconMap[code.slice(0, 4)];
  if (named) return [`${BASE_URL}/${named}.png`, WAND_ICON];

  const classCode = CLASS_CODE_BY_PREFIX[prefix2];
  const sub = Number(code.slice(2, 4));
  if (!classCode || !Number.isFinite(sub)) return [WAND_ICON];
  return [`${BASE_URL}/ICON_${classCode}_SKILL_${pad3(sub)}.png`, WAND_ICON];
}

export function abnormalIconCandidates(abnormalId: number, skillCode?: number): string[] {
  const out: string[] = [];
  const name = abnormalIcons[String(abnormalId)]?.icon;
  if (name && /^[A-Za-z0-9_]+$/.test(name)) out.push(`${BASE_URL}/${name}.png`);
  if (skillCode && skillCode > 0) {
    for (const url of skillIconCandidates(skillCode)) {
      if (url.startsWith("http") && !out.includes(url)) out.push(url);
    }
  }
  out.push(DOT_ICON);
  return out;
}

export function abnormalName(abnormalId: number): string {
  return abnormalNames[String(abnormalId)] ?? `#${abnormalId}`;
}

// --- loading, with a disk cache -------------------------------------------

const resolved = new Map<string, string>(); // url -> blob url
const pending = new Map<string, Promise<string | null>>();
const dead = new Set<string>();

const cacheKey = (url: string) => url.match(/\/([^/]+\.png)$/i)?.[1] ?? null;

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function load(url: string): Promise<string | null> {
  const key = cacheKey(url);
  if (key) {
    const cached = await api.readCachedIcon(key);
    if (cached) return URL.createObjectURL(new Blob([fromBase64(cached)], { type: "image/png" }));
  }
  let res: Response;
  try {
    res = await fetch(url, { mode: "cors", credentials: "omit" });
  } catch {
    // Not readable from script (CORS, offline): let the <img> load it itself.
    return url;
  }
  if (!res.ok) return null;
  const blob = await res.blob();
  if (key) blob.arrayBuffer().then((buf) => api.writeCachedIcon(key, toBase64(new Uint8Array(buf))));
  return URL.createObjectURL(blob);
}

/** The first candidate that loads, as something an <img> can show. */
export async function resolveIcon(candidates: string[]): Promise<string> {
  for (const url of candidates) {
    if (!url.startsWith("http")) return url;
    if (dead.has(url)) continue;
    const have = resolved.get(url);
    if (have) return have;
    let p = pending.get(url);
    if (!p) {
      p = load(url)
        .catch(() => null)
        .finally(() => pending.delete(url));
      pending.set(url, p);
    }
    const got = await p;
    if (got) {
      resolved.set(url, got);
      return got;
    }
    dead.add(url);
  }
  return WAND_ICON;
}

/** Synchronous answer when the icon is already loaded, so rows do not flash. */
export function iconIfReady(candidates: string[]): string | null {
  for (const url of candidates) {
    if (!url.startsWith("http")) return url;
    const have = resolved.get(url);
    if (have) return have;
    if (!dead.has(url)) return null;
  }
  return WAND_ICON;
}
