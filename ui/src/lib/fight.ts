// Turns the backend's per-skill rows into what the tables show.

import type { ActorSummary, BuffTrack, SkillEntry, TargetDetails } from "./types";
import { classOf, type ClassInfo } from "./classes";

export interface HitStats {
  damage: number;
  hits: number;
  crit: number;
  back: number;
  perfect: number;
  double: number;
  parry: number;
}

export interface SkillRow extends HitStats {
  code: number;
  name: string;
  isDot: boolean;
  maxHit: number;
  timestamps: number[];
  /**
   * Each hit's damage, in step with `timestamps`. A fight saved before this
   * was recorded has the skill's mean hit for every one.
   */
  hitDamage: number[];
  /** Times the skill was used (see `castTimes`); 0 for a DoT or when hit times are missing. */
  casts: number;
}

/** Hits of one skill less than this far apart are one cast. */
export const CAST_GAP_MS = 700;

/**
 * When a skill was used, from when it hit: the capture records hits, not
 * button presses, so a cast is a run of hits less than `CAST_GAP_MS` apart.
 */
export function castTimes(timestamps: number[]): { t: number; hits: number }[] {
  const out: { t: number; hits: number }[] = [];
  let last = -Infinity;
  for (const t of [...timestamps].sort((a, b) => a - b)) {
    if (t - last > CAST_GAP_MS) out.push({ t, hits: 0 });
    out[out.length - 1].hits += 1;
    last = t;
  }
  return out;
}

export interface PlayerRow extends HitStats {
  id: number;
  name: string;
  cls: ClassInfo;
  dps: number;
  share: number;
  isLocal: boolean;
  combatPower: number;
  gearScore: number;
  heal: number;
  taken: number;
  skills: SkillRow[];
}

const emptyStats = (): HitStats => ({ damage: 0, hits: 0, crit: 0, back: 0, perfect: 0, double: 0, parry: 0 });

function add(into: HitStats, s: SkillEntry) {
  into.damage += s.dmg || 0;
  into.hits += s.time || 0;
  into.crit += s.crit || 0;
  into.back += s.back || 0;
  into.perfect += s.perfect || 0;
  into.double += s.double || 0;
  into.parry += s.parry || 0;
}

export interface ActorInfo {
  name: string;
  job: string;
  jobId?: number;
  combatPower?: number;
  gearScore?: number;
  heal?: number;
  taken?: number;
}

/**
 * One row per actor, most damage first. `actors` names them: the fight's
 * roster for a saved fight, the live snapshot's map for the meter.
 */
export function buildPlayers(
  details: Pick<TargetDetails, "skills" | "battleTime">,
  actors: Map<number, ActorInfo>,
  localId: number | null,
): PlayerRow[] {
  const byActor = new Map<number, { stats: HitStats; skills: Map<string, SkillRow>; job: string }>();
  for (const s of details.skills) {
    let entry = byActor.get(s.actorId);
    if (!entry) {
      entry = { stats: emptyStats(), skills: new Map(), job: s.job };
      byActor.set(s.actorId, entry);
    }
    add(entry.stats, s);
    // A skill and its DoT share a name but not a code; keep them apart.
    const key = `${s.code}:${s.isDot ? 1 : 0}`;
    let row = entry.skills.get(key);
    if (!row) {
      row = { ...emptyStats(), code: s.code, name: s.name, isDot: s.isDot, maxHit: 0, timestamps: [], hitDamage: [], casts: 0 };
      entry.skills.set(key, row);
    }
    add(row, s);
    row.maxHit = Math.max(row.maxHit, s.maxDmg || 0);
    const times = s.hitTimestamps ?? [];
    if (times.length) {
      const each =
        s.hitDamages?.length === times.length ? s.hitDamages : new Array<number>(times.length).fill((s.dmg || 0) / times.length);
      row.timestamps = row.timestamps.concat(times);
      row.hitDamage = row.hitDamage.concat(each);
    }
  }

  for (const entry of byActor.values()) {
    for (const row of entry.skills.values()) {
      if (!row.isDot) row.casts = castTimes(row.timestamps).length;
    }
  }

  const seconds = Math.max(1, (details.battleTime || 0) / 1000);
  const total = [...byActor.values()].reduce((t, e) => t + e.stats.damage, 0);
  const rows: PlayerRow[] = [];
  for (const [id, entry] of byActor) {
    const info = actors.get(id);
    rows.push({
      ...entry.stats,
      id,
      name: info?.name || `#${id}`,
      cls: classOf(info?.job || entry.job, info?.jobId),
      dps: entry.stats.damage / seconds,
      share: total > 0 ? entry.stats.damage / total : 0,
      isLocal: localId != null && id === localId,
      combatPower: info?.combatPower ?? 0,
      gearScore: info?.gearScore ?? 0,
      heal: info?.heal ?? 0,
      taken: info?.taken ?? 0,
      skills: [...entry.skills.values()].sort((a, b) => b.damage - a.damage),
    });
  }
  return rows.sort((a, b) => b.damage - a.damage);
}

export function rosterOf(actors: ActorSummary[]): Map<number, ActorInfo> {
  return new Map(
    actors.map((a) => [
      a.actorId,
      {
        name: a.nickname,
        job: a.job,
        jobId: a.jobId,
        combatPower: a.combatPower,
        gearScore: a.gearScore,
        heal: a.partyHeal,
        taken: a.damageReceived,
      },
    ]),
  );
}

/**
 * Who "you" were in a saved fight. Fights saved before names were kept in
 * full masked every name but the local player's (`Wa****u`), so there the one
 * unmasked name is the only thing that marks it.
 */
export function localActorOf(actors: ActorSummary[]): number | null {
  const marked = actors.find((a) => a.isLocal);
  if (marked) return marked.actorId;
  const open = actors.filter((a) => a.nickname && !a.nickname.includes("*") && !/^#?\d+$/.test(a.nickname));
  return open.length === 1 ? open[0].actorId : null;
}

/**
 * Damage per second over `count` equal slices of the fight, from when each
 * hit landed.
 */
export function dpsSeries(player: PlayerRow, durationMs: number, count: number): number[] {
  const slice = Math.max(1, durationMs) / count;
  const out = new Array<number>(count).fill(0);
  for (const s of player.skills) {
    s.timestamps.forEach((t, i) => {
      out[Math.min(count - 1, Math.max(0, Math.floor(t / slice)))] += s.hitDamage[i];
    });
  }
  return out.map((v) => v / (slice / 1000));
}

/**
 * Each player's average so far at the end of each of `count` equal slices:
 * the damage dealt up to then over the time up to then. It ends on the
 * fight's DPS, and shows an opening burst fading into it.
 */
export function averageDpsSeries(player: PlayerRow, durationMs: number, count: number): number[] {
  const seconds = Math.max(1, durationMs) / count / 1000;
  let dealt = 0;
  return dpsSeries(player, durationMs, count).map((dps, i) => (dealt += dps * seconds) / ((i + 1) * seconds));
}

/** What the game said about the boss's health during a fight, when it was recorded. */
export interface BossHealth {
  maxHp: number;
  /** [ms since the start, hp] readings. */
  history?: [number, number][];
  killed?: boolean;
}

/** The boss's health as a share (0-1) of its maximum, `t` ms into the fight. */
export interface HealthPoint {
  t: number;
  share: number;
}

/**
 * The boss's health over the fight, as points to join up, or null when its
 * maximum is not known.
 *
 * From the game's own readings when the fight has them, each at the moment
 * it arrived. Older fights have none, and there it is the maximum less every
 * recorded hit so far: that misses anyone the capture did not see, and
 * open-world bosses lose more health per hit than the damage recorded, so
 * there it reads high.
 */
export function bossHpLine(players: PlayerRow[], durationMs: number, boss: BossHealth): HealthPoint[] | null {
  const duration = Math.max(1, durationMs);
  const history = boss.history ?? [];
  // A boss joined part-way never shows its full health: the highest reading stands in.
  const maxHp = history.reduce((max, [, hp]) => Math.max(max, hp), boss.maxHp);
  if (!(maxHp > 0)) return null;
  const share = (hp: number) => Math.min(1, Math.max(0, hp / maxHp));

  let line: HealthPoint[];
  if (history.length >= 2) {
    line = history.map(([t, hp]) => ({ t: Math.min(duration, Math.max(0, t)), share: share(hp) }));
    // The first reading arrives with the first hit, already less that hit.
    // On a boss pulled at full health, the line starts from full.
    const first = line[0];
    if (first.t <= 500 && first.share >= 0.9 && first.share < 1) line.unshift({ t: 0, share: 1 });
    const last = line[line.length - 1];
    if (last.t < duration) line.push({ t: duration, share: last.share });
  } else {
    const count = 120;
    const slice = duration / count;
    const dealt = new Array<number>(count).fill(0);
    for (const p of players) {
      for (const s of p.skills) {
        s.timestamps.forEach((t, i) => {
          dealt[Math.min(count - 1, Math.max(0, Math.floor(t / slice)))] += s.hitDamage[i];
        });
      }
    }
    let sum = 0;
    line = [{ t: 0, share: 1 }, ...dealt.map((d, i) => ({ t: (i + 1) * slice, share: share(maxHp - (sum += d)) }))];
  }
  // The killing blow is often the one reading that never arrives.
  if (boss.killed) line[line.length - 1] = { t: duration, share: 0 };
  return line;
}

/** The health on `line` at `t`, or null before its first point. */
export function healthAt(line: HealthPoint[], t: number): number | null {
  const next = line.findIndex((p) => p.t >= t);
  if (next < 0) return line[line.length - 1].share;
  if (next === 0) return line[0].t > t ? null : line[0].share;
  const a = line[next - 1];
  const b = line[next];
  return b.t === a.t ? b.share : a.share + (b.share - a.share) * ((t - a.t) / (b.t - a.t));
}

// --- rotation --------------------------------------------------------------

/**
 * A class skill whose two-digit number is 70 or above is a passive: it fires
 * by itself (a proc, an aura) and is not part of what the player pressed.
 */
export function isPassiveSkill(code: number): boolean {
  const digits = String(code).padEnd(8, "0").slice(0, 8);
  const cls = Number(digits.slice(0, 2));
  return cls >= 11 && cls <= 19 && Number(digits.slice(2, 4)) >= 70;
}

export interface Cast {
  code: number;
  name: string;
  /** Milliseconds from the fight's start. */
  t: number;
  hits: number;
}

/**
 * The order a player used their skills in. A skill that hit nothing does not
 * appear, and DoT ticks are left out.
 */
export function buildCasts(player: PlayerRow, withPassives = false): Cast[] {
  const casts: Cast[] = [];
  for (const s of player.skills) {
    if (s.isDot || !s.timestamps.length) continue;
    if (!withPassives && isPassiveSkill(s.code)) continue;
    for (const c of castTimes(s.timestamps)) casts.push({ code: s.code, name: s.name, t: c.t, hits: c.hits });
  }
  return casts.sort((a, b) => a.t - b.t);
}

// --- buffs -----------------------------------------------------------------

export interface BuffCell {
  /** Share (0-1) of the row player's damage dealt while the effect was on. */
  damage: number;
  /** Share (0-1) of the fight it was on. */
  time: number;
}

export interface BuffColumn {
  key: string;
  id: number;
  skill: number;
  /** Who applied it, longest first. */
  casters: number[];
  /** By the id of the player whose damage it covered. */
  cells: Map<number, BuffCell>;
  /** Damage dealt while it was on by everyone but those who applied it. */
  given: number;
  total: number;
}

export type BuffKind = "party" | "self" | "boss";

/**
 * One key for every rank and variant of an effect. A class skill's abnormals
 * are numbered from the skill (class and skill number, then the variant), so
 * those share their first four digits; anything else is its own. One skill
 * can buff allies and debuff the boss, and those are two effects.
 */
export function buffKey(track: Pick<BuffTrack, "id">, onBoss: boolean): string {
  const cls = Math.floor(track.id / 1e7);
  const key = track.id < 1e9 && cls >= 11 && cls <= 19 ? `f${Math.floor(track.id / 1e5)}` : `a${track.id}`;
  return onBoss ? `boss:${key}` : key;
}

type Span = [start: number, end: number];

/** A track's segments, cut to the fight. */
function spansOf(track: BuffTrack, duration: number): Span[] {
  const out: Span[] = [];
  for (const seg of (track.segs ?? "").split(";")) {
    const [start, end] = seg.split(",").map(Number);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const from = Math.max(0, start);
    const to = Math.min(duration, end);
    if (to > from) out.push([from, to]);
  }
  return out;
}

/** Overlapping spans joined, in order. */
function union(spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const [start, end] of [...spans].sort((a, b) => a[0] - b[0])) {
    const last = out[out.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else out.push([start, end]);
  }
  return out;
}

/** A player's hits in order, with the damage dealt up to each. */
interface Timeline {
  times: number[];
  /** `sums[i]` is the damage of the first `i` hits. */
  sums: number[];
}

function timelineOf(player: PlayerRow): Timeline {
  const hits: [number, number][] = [];
  for (const s of player.skills) {
    s.timestamps.forEach((t, i) => hits.push([t, s.hitDamage[i] ?? 0]));
  }
  hits.sort((a, b) => a[0] - b[0]);
  const sums = [0];
  for (const [, damage] of hits) sums.push(sums[sums.length - 1] + damage);
  return { times: hits.map(([t]) => t), sums };
}

/** How many of `times` are below `t` (or at it, with `inclusive`). */
function countBefore(times: number[], t: number, inclusive: boolean): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t || (inclusive && times[mid] === t)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function damageWithin(line: Timeline, spans: Span[]): number {
  let sum = 0;
  for (const [start, end] of spans) {
    sum += line.sums[countBefore(line.times, end, true)] - line.sums[countBefore(line.times, start, false)];
  }
  return sum;
}

/**
 * Buff columns for one tab, each cell the share of a player's damage dealt
 * while the effect was on. `party`: put on the player by someone else.
 * `self`: by themselves. `boss`: debuffs the players put on the target, which
 * cover everyone's damage alike.
 *
 * Every rank of an effect is one column (see `buffKey`), and so are several
 * casters of it: what counts is whether it was on.
 */
export function buildBuffs(
  tracks: BuffTrack[],
  kind: BuffKind,
  players: PlayerRow[],
  targetId: number,
  durationMs: number,
  limit = 14,
): BuffColumn[] {
  const duration = Math.max(1, durationMs);
  const playerIds = new Set(players.map((p) => p.id));
  // The boss's debuffs are one set of spans for every row.
  const EVERYONE = 0;
  const columns = new Map<string, { id: number; skill: number; spans: Map<number, Span[]>; casters: Map<number, number> }>();
  for (const t of tracks) {
    if (t.passive || t.summon || !(t.up > 0)) continue;
    const onBoss = t.on === targetId;
    let rowId: number;
    if (kind === "boss") {
      if (!onBoss || !playerIds.has(t.by)) continue;
      rowId = EVERYONE;
    } else {
      if (onBoss || !playerIds.has(t.on)) continue;
      const self = t.by === t.on || t.by === 0;
      if ((kind === "self") !== self) continue;
      rowId = t.on;
    }
    const key = buffKey(t, onBoss);
    let col = columns.get(key);
    if (!col) columns.set(key, (col = { id: t.id, skill: t.skill ?? 0, spans: new Map(), casters: new Map() }));
    const spans = spansOf(t, duration);
    col.spans.set(rowId, [...(col.spans.get(rowId) ?? []), ...spans]);
    if (t.by) col.casters.set(t.by, (col.casters.get(t.by) ?? 0) + t.up);
  }

  const timelines = new Map(players.map((p) => [p.id, timelineOf(p)]));
  const out: BuffColumn[] = [];
  for (const [key, col] of columns) {
    const cells = new Map<number, BuffCell>();
    let given = 0;
    for (const p of players) {
      const raw = col.spans.get(kind === "boss" ? EVERYONE : p.id);
      if (!raw) continue;
      const spans = union(raw);
      const line = timelines.get(p.id)!;
      const dealt = line.sums[line.sums.length - 1];
      const within = damageWithin(line, spans);
      cells.set(p.id, {
        damage: dealt > 0 ? within / dealt : 0,
        time: spans.reduce((sum, [start, end]) => sum + end - start, 0) / duration,
      });
      if (!col.casters.has(p.id)) given += within;
    }
    out.push({
      key,
      id: col.id,
      skill: col.skill,
      casters: [...col.casters].sort((a, b) => b[1] - a[1]).map(([id]) => id),
      cells,
      given,
      total: [...cells.values()].reduce((sum, c) => sum + c.damage, 0),
    });
  }
  // An effect that covered not even a twentieth of anyone's damage is noise.
  return out
    .filter((c) => Math.max(0, ...[...c.cells.values()].map((cell) => cell.damage)) >= 0.05)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

// --- rDPS ------------------------------------------------------------------

/** Damage moved by buffs: what a player's hits owed to others, and what others' hits owed to them. */
export interface Contribution {
  received: number;
  given: number;
}

interface Effect {
  key: string;
  /** Damage added while on, as a fraction. */
  value: number;
  onBoss: boolean;
  casters: Map<number, Span[]>;
}

/**
 * An estimate of how much of each player's damage came from someone else's
 * buff on them or debuff on the boss, credited to who applied it. `values`
 * is the damage each effect adds, in percent by `buffKey`; an effect without
 * one moves nothing.
 *
 * Buffs on the attacker add up with each other, debuffs on the boss with each
 * other, and the two multiply: the game's formula is not known, and this is
 * how its two stats ("Damage Boost", "Damage Tolerance") read. An effect a
 * player applied themselves is their own damage and moves nothing.
 */
export function buildContribution(
  tracks: BuffTrack[],
  players: PlayerRow[],
  targetId: number,
  durationMs: number,
  values: Record<string, number>,
  exclusive: string[][] = [],
): Map<number, Contribution> {
  const duration = Math.max(1, durationMs);
  const playerIds = new Set(players.map((p) => p.id));
  const out = new Map<number, Contribution>(players.map((p) => [p.id, { received: 0, given: 0 }]));
  const EVERYONE = 0;
  // By whose damage it covers, then by effect.
  const covering = new Map<number, Map<string, Effect>>();
  for (const t of tracks) {
    if (t.summon || !playerIds.has(t.by)) continue;
    const onBoss = t.on === targetId;
    const key = buffKey(t, onBoss);
    const value = (values[key] ?? 0) / 100;
    if (!(value > 0)) continue;
    if (!onBoss && (!playerIds.has(t.on) || t.on === t.by)) continue;
    const who = onBoss ? EVERYONE : t.on;
    let effects = covering.get(who);
    if (!effects) covering.set(who, (effects = new Map()));
    let effect = effects.get(key);
    if (!effect) effects.set(key, (effect = { key, value, onBoss, casters: new Map() }));
    const spans: Span[] = t.passive ? [[0, duration]] : spansOf(t, duration);
    effect.casters.set(t.by, [...(effect.casters.get(t.by) ?? []), ...spans]);
  }
  if (!covering.size) return out;

  const onBoss = [...(covering.get(EVERYONE)?.values() ?? [])];
  for (const p of players) {
    const effects = [...onBoss, ...(covering.get(p.id)?.values() ?? [])];
    if (!effects.length) continue;
    const mine = out.get(p.id)!;
    for (const s of p.skills) {
      s.timestamps.forEach((t, i) => {
        const damage = s.hitDamage[i];
        if (!(damage > 0)) return;
        let active: { effect: Effect; by: number[] }[] = [];
        for (const effect of effects) {
          const by: number[] = [];
          for (const [caster, spans] of effect.casters) {
            if (spans.some(([start, end]) => start <= t && t <= end)) by.push(caster);
          }
          if (by.length && !by.includes(p.id)) active.push({ effect, by });
        }
        for (const group of exclusive) {
          const rivals = active.filter((a) => group.includes(a.effect.key));
          if (rivals.length < 2) continue;
          const best = rivals.reduce((a, b) => (b.effect.value > a.effect.value ? b : a));
          active = active.filter((a) => a === best || !rivals.includes(a));
        }
        if (!active.length) return;
        const buffs = active.filter((a) => !a.effect.onBoss).reduce((sum, a) => sum + a.effect.value, 0);
        const debuffs = active.filter((a) => a.effect.onBoss).reduce((sum, a) => sum + a.effect.value, 0);
        const gain = damage * (1 - 1 / ((1 + buffs) * (1 + debuffs)));
        // Between the two kinds the gain is split by their logs, which is
        // what makes the shares of two multiplied bonuses add up to the whole.
        const logs = Math.log1p(buffs) + Math.log1p(debuffs);
        mine.received += gain;
        for (const { effect, by } of active) {
          const kind = effect.onBoss ? debuffs : buffs;
          const share = gain * (Math.log1p(kind) / logs) * (effect.value / kind);
          for (const caster of by) out.get(caster)!.given += share / by.length;
        }
      });
    }
  }
  return out;
}
