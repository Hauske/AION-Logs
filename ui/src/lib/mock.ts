// Dev only: answers backend calls from saved fights dropped in ui/mock/*.json
// (copies of %APPDATA%\com.a2tools.dps-meter\history). Never bundled: api.ts
// imports this behind import.meta.env.DEV.

import type { DpsData, FightRecord, FightSummary } from "./types";

const files = import.meta.glob<FightRecord>("../../mock/*.json", { eager: true, import: "default" });
const fights = Object.values(files).sort((a, b) => b.startTimeMs - a.startTimeMs);
const live = fights[0];

const params = new URLSearchParams(location.search);
const idle = params.has("idle");

function snapshot(): DpsData {
  const empty: DpsData = {
    map: {}, targetName: "", targetMode: "bossTargets", targetId: 0, detailTargetIds: [], battleTime: 0,
    localPlayerId: null, targetMaxHp: 0, targetTotalDamage: 0, targetCurrentHp: -1, targetIsBoss: false, dungeonId: 0,
  };
  if (!live || idle) return empty;
  const seconds = live.durationMs / 1000;
  const map: DpsData["map"] = {};
  for (const a of live.actors) {
    const amount = live.details.skills.filter((s) => s.actorId === a.actorId).reduce((t, s) => t + s.dmg, 0);
    map[a.actorId] = {
      job: a.job, nickname: a.nickname, amount, dps: amount / seconds,
      damageContribution: (amount / live.totalDamage) * 100, combatPower: a.combatPower,
      inParty: a.jobId !== 12,
    };
  }
  const local = live.actors.find((a) => !a.nickname.includes("*"));
  return {
    ...empty, map, targetName: live.bossName, targetId: live.targetId, detailTargetIds: [live.targetId],
    battleTime: live.durationMs, localPlayerId: local?.actorId ?? null, targetMaxHp: live.details.maxHp,
    targetTotalDamage: live.totalDamage, targetCurrentHp: Math.round(live.details.maxHp * 0.37), targetIsBoss: true,
  };
}

const settings: Record<string, string> = {};
// ?per=<n> previews the encounters-per-page setting.
if (params.get("per")) settings["aionLogs.encountersPerPage"] = params.get("per")!;
// ?chart=average previews the chart's other reading.
if (params.get("chart")) settings["aionLogs.chartMode"] = params.get("chart")!;
// ?w=<px> previews the meter at that width.
if (params.get("w")) settings["aionLogs.meterWidth"] = params.get("w")!;

export function answer(cmd: string, args?: Record<string, unknown>): unknown {
  switch (cmd) {
    case "get_dps_snapshot": return snapshot();
    case "get_skill_details": return live?.details;
    case "get_fight_buffs":
      return live ? { targetId: live.targetId, startTimeMs: live.startTimeMs, durationMs: live.durationMs, buffs: live.buffs ?? [] } : null;
    case "get_fight_history": {
      // ?many=<n> repeats the saved fights to fill several pages.
      const many = Number(params.get("many")) || fights.length;
      return Array.from({ length: many }, (_, i): FightSummary => {
        const f = fights[i % fights.length];
        return {
          id: i < fights.length ? f.id : `${f.id}_${i}`, bossName: f.bossName, targetId: f.targetId,
          startTimeMs: f.startTimeMs - Math.floor(i / fights.length) * 3600000, durationMs: f.durationMs,
          totalDamage: f.totalDamage, jobs: f.actors.map((a) => a.job), isTrain: f.isTrain, isLive: false,
          dungeonId: f.dungeonId, memberJobs: f.actors.map((a) => a.job),
          // Some are shown as wipes so both colours can be previewed.
          outcome: i % 3 === 1 ? "wipe" : "clear",
        };
      });
    }
    case "load_fight": {
      const f = fights.find((x) => x.id === args?.id);
      if (!f) throw new Error("no such fight");
      return f;
    }
    case "get_settings": return { ...settings };
    case "update_settings": settings[String(args?.key)] = String(args?.value); return null;
    case "get_capture_status":
      return { locked: true, port: 12345, device: "Ethernet", localPlayerId: snapshot().localPlayerId, characterName: "Yuus", characterNameFromGame: true };
    case "get_app_version": return "dev";
    // ?update=<version> previews an update being offered.
    case "check_for_update":
    case "available_update": return params.get("update");
    case "install_update": return new Promise(() => {});
    case "is_admin": return true;
    case "take_pending_details_request": return params.get("fight") ? { kind: "fight", fightId: params.get("fight") } : null;
    case "read_cached_icon": return null;
    default: return null;
  }
}

export function subscribe(event: string, handler: (payload: unknown) => void): () => void {
  if (event === "dps-update") {
    const t = setInterval(() => handler(snapshot()), 500);
    return () => clearInterval(t);
  }
  if (event === "ping-update") {
    handler(83);
  }
  return () => {};
}
