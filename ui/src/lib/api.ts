// The only place that talks to the Rust backend. Outside Tauri (vite dev in a
// browser) every call is answered from ui/mock, so the UI can be worked on
// without the game running.

import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";
import type {
  CaptureStatus,
  DpsData,
  FightRecord,
  FightSummary,
  LiveFightBuffs,
  TargetDetails,
} from "./types";

export const inTauri = "__TAURI_INTERNALS__" in window;

export type View = "main" | "history" | "details" | "settings";

function detectView(): View {
  const injected = (window as any).__A2_VIEW__;
  const fromUrl = new URLSearchParams(location.search).get("view");
  const candidate = injected || fromUrl;
  if (candidate === "history" || candidate === "details" || candidate === "settings") return candidate;
  return "main";
}

export const view: View = detectView();

let mock: typeof import("./mock") | null = null;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (inTauri) return tauriInvoke<T>(cmd, args);
  if (import.meta.env.DEV) {
    mock ??= await import("./mock");
    return mock.answer(cmd, args) as T;
  }
  throw new Error(`no backend for ${cmd}`);
}

export function on<T>(event: string, handler: (payload: T) => void): () => void {
  if (!inTauri) {
    if (import.meta.env.DEV) {
      let stop = () => {};
      import("./mock").then((m) => (stop = m.subscribe(event, handler as (p: unknown) => void)));
      return () => stop();
    }
    return () => {};
  }
  let unlisten: (() => void) | null = null;
  let cancelled = false;
  tauriListen<T>(event, (e) => handler(e.payload)).then((u) => {
    if (cancelled) u();
    else unlisten = u;
  });
  return () => {
    cancelled = true;
    unlisten?.();
  };
}

const quiet = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

export const api = {
  // Live combat
  snapshot: () => invoke<DpsData>("get_dps_snapshot"),
  liveDetails: (targetId: number) =>
    invoke<TargetDetails>("get_skill_details", { targetId, actorIds: null, summaryOnly: false }),
  liveBuffs: (targetId: number) => invoke<LiveFightBuffs | null>("get_fight_buffs", { targetId }),
  resetCombat: () => quiet(invoke<void>("reset_combat"), undefined),
  setTargetMode: (mode: "bossTargets" | "trainTargets") =>
    quiet(invoke<void>("set_target_mode", { mode }), undefined),

  // Identity
  captureStatus: () => invoke<CaptureStatus>("get_capture_status"),
  gameWindowTitle: () => quiet(invoke<string | null>("get_aion2_window_title"), null),
  setCharacterName: (name: string, manual: boolean) =>
    quiet(invoke<void>("set_character_name", { name, manual }), undefined),
  bindLocalActor: (actorId: number) =>
    quiet(invoke<void>("bind_local_actor_id", { actorId, manual: false }), undefined),

  // History
  fights: () => invoke<FightSummary[]>("get_fight_history"),
  loadFight: (id: string) => invoke<FightRecord>("load_fight", { id }),
  deleteFight: (id: string) => invoke<void>("delete_fight", { id }),

  // Settings (all values are strings)
  settings: () => quiet(invoke<Record<string, string>>("get_settings"), {}),
  setSetting: (key: string, value: string) =>
    quiet(invoke<void>("update_settings", { key, value }), undefined),

  // Windows
  openLogs: () => quiet(invoke<void>("request_details_view", { payload: { kind: "history" } }), undefined),
  takePendingRequest: () => quiet(invoke<unknown>("take_pending_details_request"), null),
  toolWindowReady: (label: string) => quiet(invoke<boolean>("tool_window_ready", { label }), false),
  closeToolWindow: () => quiet(invoke<void>("close_tool_window"), undefined),
  mainWindowReady: () => quiet(invoke<void>("main_window_ready"), undefined),
  resizeMeter: (width: number, height: number) =>
    quiet(invoke<void>("resize_window", { width, height, scale: window.devicePixelRatio || 1 }), undefined),
  startDrag: () => quiet(invoke<void>("start_drag"), undefined),
  quit: () => quiet(invoke<void>("quit_app"), undefined),
  isAdmin: () => quiet(invoke<boolean>("is_admin"), true),
  appVersion: () => quiet(invoke<string>("get_app_version"), ""),
  // Updates: see update.svelte.ts.
  /** Looks now: the newer release's version, or null when this is the newest. */
  checkForUpdate: () => invoke<string | null>("check_for_update"),
  availableUpdate: () => quiet(invoke<string | null>("available_update"), null),
  /** Resolves only on failure: on success the app has closed for the installer. */
  installUpdate: () => invoke<void>("install_update"),
  openUrl: (url: string) => quiet(invoke<void>("open_url", { url }), undefined),

  // Icon cache on disk (base64 PNG)
  readCachedIcon: (key: string) => quiet(invoke<string | null>("read_cached_icon", { key }), null),
  writeCachedIcon: (key: string, data: string) =>
    quiet(invoke<void>("write_cached_icon", { key, data }), undefined),
};
