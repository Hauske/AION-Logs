// Shapes the Rust backend sends (serde camelCase). See src-tauri/src/entity.

export interface PersonalData {
  job: string;
  dps: number;
  amount: number;
  damageContribution: number;
  nickname: string;
  combatPower: number;
  /** On the party roster. */
  inParty: boolean;
}

export interface DpsData {
  map: Record<string, PersonalData>;
  targetName: string;
  targetMode: string;
  targetId: number;
  detailTargetIds: number[];
  battleTime: number;
  localPlayerId: number | null;
  targetMaxHp: number;
  targetTotalDamage: number;
  targetCurrentHp: number;
  targetIsBoss: boolean;
  dungeonId: number;
}

export interface SkillEntry {
  actorId: number;
  code: number;
  name: string;
  /** Number of hits. */
  time: number;
  dmg: number;
  multiHitCount: number;
  multiHitDamage: number;
  multiHitHits: number;
  minDmg: number;
  maxDmg: number;
  crit: number;
  parry: number;
  back: number;
  frontal: number;
  perfect: number;
  double: number;
  miss: number;
  resist: number;
  job: string;
  isDot: boolean;
  /** Milliseconds from the fight's start, one per hit. */
  hitTimestamps: number[];
  /** Each hit's damage, in step with `hitTimestamps`. Missing in older fights. */
  hitDamages?: number[];
}

export interface TargetDetails {
  targetId: number;
  maxHp: number;
  totalTargetDamage: number;
  battleTime: number;
  startTime: number;
  skills: SkillEntry[];
  healSkills: SkillEntry[];
}

export interface ActorSummary {
  actorId: number;
  nickname: string;
  /** The player who recorded the fight. Absent in fights saved before names were kept in full. */
  isLocal?: boolean;
  job: string;
  jobId: number;
  partyHeal: number;
  damageReceived: number;
  hitsReceived: number;
  level: number;
  gearScore: number;
  combatPower: number;
}

export interface BuffTrack {
  /** Whom it was on: an actor id or the fight's target. */
  on: number;
  summon?: boolean;
  id: number;
  /** Who applied it; 0 when not named. */
  by: number;
  skill?: number;
  passive?: boolean;
  /** `start,end,stacks,how;...` in ms from the fight's start. */
  segs?: string;
  /** Time on within the fight, in ms. */
  up: number;
}

export interface FightRecord {
  id: string;
  bossName: string;
  targetId: number;
  startTimeMs: number;
  durationMs: number;
  totalDamage: number;
  details: TargetDetails;
  actors: ActorSummary[];
  isTrain: boolean;
  mobCode: number;
  dungeonId: number;
  buffs?: BuffTrack[];
  /** The boss's health as the game reported it: [ms since the start, hp]. */
  hpHistory?: [number, number][];
  /** The game reported the boss dead. */
  killed?: boolean;
}

export interface FightSummary {
  id: string;
  bossName: string;
  targetId: number;
  startTimeMs: number;
  durationMs: number;
  totalDamage: number;
  jobs: string[];
  isTrain: boolean;
  isLive: boolean;
  dungeonId: number;
  memberJobs: string[];
  /** How it ended, judged from the damage dealt; "" when not known. */
  outcome: "clear" | "wipe" | "";
}

export interface LiveFightBuffs {
  targetId: number;
  startTimeMs: number;
  durationMs: number;
  buffs: BuffTrack[];
}

export interface CaptureStatus {
  locked: boolean;
  port: number | null;
  device: string;
  localPlayerId: number | null;
  characterName: string | null;
  characterNameFromGame: boolean;
}
