<script lang="ts">
  import { onMount } from "svelte";
  import { api, on } from "../lib/api";
  import { buildPlayers, type ActorInfo, type PlayerRow } from "../lib/fight";
  import { abbr, clock, full, pct } from "../lib/format";
  import { classOf } from "../lib/classes";
  import { getBool, getNumber, getSetting, KEYS, setSetting, settings, startSettings } from "../lib/settings.svelte";
  import { startUpdates, update } from "../lib/update.svelte";
  import type { CaptureStatus, DpsData, TargetDetails } from "../lib/types";
  import ClassIcon from "../components/ClassIcon.svelte";
  import SkillTable from "../components/SkillTable.svelte";

  let snap = $state<DpsData | null>(null);
  let details = $state<TargetDetails | null>(null);
  let status = $state<CaptureStatus | null>(null);
  let ping = $state<number | null>(null);
  let selected = $state<number | null>(null);
  let root: HTMLElement;

  const training = $derived(getBool(KEYS.training));

  type Scope = "me" | "party" | "all";
  const SCOPES: { key: Scope; label: string; hint: string }[] = [
    { key: "me", label: "Me", hint: "Only your own damage" },
    { key: "party", label: "Party", hint: "You and your party" },
    { key: "all", label: "Everyone", hint: "Everyone hitting the boss" },
  ];
  const scope = $derived.by((): Scope => {
    const v = getSetting(KEYS.scope);
    return v === "me" || v === "all" ? v : "party";
  });
  const clampWidth = (w: number) => Math.min(900, Math.max(360, Math.round(w)));
  /** The width while the right edge is being dragged; saved on release. */
  let dragWidth = $state<number | null>(null);
  const width = $derived(dragWidth ?? clampWidth(getNumber(KEYS.width) || 500));

  // The window is sized to the meter, so its edge cannot be grabbed like a
  // normal window's: the meter has its own handle that changes the width.
  function startResize(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    const from = e.screenX;
    const start = width;
    handle.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => (dragWidth = clampWidth(start + m.screenX - from));
    const stop = () => {
      handle.removeEventListener("pointermove", move);
      if (dragWidth != null) setSetting(KEYS.width, dragWidth);
      dragWidth = null;
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop, { once: true });
    handle.addEventListener("pointercancel", stop, { once: true });
  }
  const opacity = $derived(Math.min(100, Math.max(30, getNumber(KEYS.opacity) || 85)) / 100);

  // Training dummies are the one thing besides a boss the meter will show,
  // and only when asked.
  $effect(() => {
    if (settings.loaded) api.setTargetMode(training ? "trainTargets" : "bossTargets");
  });

  const detailTarget = $derived(snap ? snap.targetId || snap.detailTargetIds[0] || 0 : 0);

  interface Row {
    id: number;
    name: string;
    job: string;
    amount: number;
    dps: number;
    share: number;
    /** 0 when not known: it comes from the party roster only. */
    power: number;
    isLocal: boolean;
    stats: PlayerRow | undefined;
  }

  const players = $derived.by(() => {
    if (!snap || !details) return new Map<number, PlayerRow>();
    const actors = new Map<number, ActorInfo>(
      Object.entries(snap.map).map(([id, p]) => [Number(id), { name: p.nickname, job: p.job }]),
    );
    return new Map(buildPlayers(details, actors, snap.localPlayerId).map((p) => [p.id, p]));
  });

  const rows = $derived.by((): Row[] => {
    if (!snap) return [];
    const total = Object.values(snap.map).reduce((t, p) => t + p.amount, 0);
    const local = snap.localPlayerId;
    // An instance holds only the party, whatever the roster says.
    const everyoneIsParty = snap.dungeonId > 0;
    return Object.entries(snap.map)
      .filter(([id, p]) => {
        if (scope === "all") return true;
        if (local != null && Number(id) === local) return true;
        // Not identified yet: showing nobody would look broken.
        if (local == null && scope === "me") return true;
        return scope === "party" && (p.inParty || everyoneIsParty);
      })
      .map(([id, p]) => ({
        id: Number(id),
        name: p.nickname || `#${id}`,
        job: p.job,
        amount: p.amount,
        dps: p.dps,
        share: total > 0 ? p.amount / total : 0,
        power: p.combatPower || 0,
        isLocal: snap!.localPlayerId != null && Number(id) === snap!.localPlayerId,
        stats: players.get(Number(id)),
      }))
      .filter((r) => r.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  });

  const totalDamage = $derived(rows.reduce((t, r) => t + r.amount, 0));
  const totalDps = $derived(rows.reduce((t, r) => t + r.dps, 0));
  const fighting = $derived(rows.length > 0);
  const hpShare = $derived(
    snap && snap.targetMaxHp > 0 && snap.targetCurrentHp >= 0 ? Math.min(1, snap.targetCurrentHp / snap.targetMaxHp) : null,
  );
  // Time to kill: the health left, at the pace it has been falling since the
  // meter first saw it. Timed off the boss's own health rather than the damage
  // rows: that counts everyone hitting it, seen or not, and open-world bosses
  // lose more health per hit than the damage recorded.
  let hpMark: { target: number; hp: number; at: number } | null = null;
  let ttkMs = $state<number | null>(null);

  function trackTtk(s: DpsData | null) {
    const hp = s && s.targetMaxHp > 0 ? s.targetCurrentHp : -1;
    if (!s || hp <= 0) {
      if (hp !== 0) hpMark = null;
      ttkMs = null;
      return;
    }
    const now = Date.now();
    // Another boss, or this one healed or was pulled again: time it afresh.
    if (!hpMark || hpMark.target !== s.targetId || hp > hpMark.hp) hpMark = { target: s.targetId, hp, at: now };
    const elapsed = now - hpMark.at;
    const lost = hpMark.hp - hp;
    // A couple of seconds of readings before it says anything.
    ttkMs = elapsed >= 2000 && lost > 0 ? (hp / lost) * elapsed : null;
  }

  const drill = $derived(selected != null ? (players.get(selected) ?? null) : null);

  // Each number column is as wide as the longest value it can hold ("100.0%"),
  // with a gap between, so neighbours never run into each other.
  const COLS = "minmax(0,1fr) 48px 44px 50px 40px 40px";
  const GAP = "8px";

  function parseTitleName(title: string | null): string {
    const t = String(title ?? "").trim();
    if (!t.toLowerCase().startsWith("aion2")) return "";
    return t.slice(5).trim().replace(/^[|l:-]+/i, "").trim();
  }

  // Who "you" are normally comes from the game's own packets. Until it does,
  // the game window's title is the only hint, as in A2Tools.
  async function syncIdentity() {
    status = await api.captureStatus().catch(() => null);
    if (!status || status.characterNameFromGame) return;
    const name = parseTitleName(await api.gameWindowTitle());
    if (!name) return;
    if (name !== status.characterName) api.setCharacterName(name, false);
    if (snap && snap.localPlayerId == null) {
      const mine = Object.entries(snap.map).find(([, p]) => p.nickname === name);
      if (mine) api.bindLocalActor(Number(mine[0]));
    }
  }

  async function refreshDetails() {
    if (!detailTarget) {
      details = null;
      return;
    }
    details = await api.liveDetails(detailTarget).catch(() => details);
  }

  /** Put away with the hide shortcut: nothing is drawn and the window shrinks to a dot. */
  let hidden = $state(false);

  function reset() {
    selected = null;
    details = null;
    snap = null;
    api.resetCombat();
  }

  function drag(e: MouseEvent) {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    api.startDrag();
  }

  onMount(() => {
    startSettings();
    startUpdates();
    api.snapshot().then((s) => (snap = s)).catch(() => {});
    const stops = [
      on<DpsData>("dps-update", (s) => {
        snap = s;
        trackTtk(s);
      }),
      on<number>("ping-update", (p) => (ping = p)),
      on<void>("meter-toggle", () => (hidden = !hidden)),
      on<void>("combat-reset", () => {
        selected = null;
        details = null;
      }),
    ];
    const detailsTimer = setInterval(refreshDetails, 1500);
    const identityTimer = setInterval(syncIdentity, 3000);
    syncIdentity();

    // The window is exactly as tall as the meter: anything more would be an
    // invisible rectangle that swallows clicks meant for the game.
    const fit = () => api.resizeMeter(Math.ceil(root.offsetWidth), Math.ceil(root.offsetHeight));
    const observer = new ResizeObserver(fit);
    observer.observe(root);
    // Sent when the meter comes back from being hidden.
    stops.push(on<void>("force-resize", fit));
    api.mainWindowReady();

    return () => {
      stops.forEach((stop) => stop());
      clearInterval(detailsTimer);
      clearInterval(identityTimer);
      observer.disconnect();
    };
  });

  // A selected player who is no longer in the fight has nothing to show.
  $effect(() => {
    if (selected != null && snap && !(String(selected) in snap.map)) selected = null;
  });
</script>

<div class="meter" class:hidden bind:this={root} style:width="{width}px" style:--alpha={opacity}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <header onmousedown={drag}>
    {#if drill}
      <button class="icon" title="Back" onclick={() => (selected = null)}>
        <svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      <ClassIcon cls={drill.cls} size={18} />
      <span class="title">{drill.name}</span>
      <span class="stat">{abbr(drill.damage)}</span>
      <span class="stat dim">{abbr(drill.dps)}<span class="unit">/s</span></span>
    {:else if fighting && snap}
      <span class="title">{snap.targetName || (training ? "Training" : "Boss")}</span>
      <span class="stat">{clock(snap.battleTime)}</span>
      <span class="stat">{abbr(totalDamage)}</span>
      <span class="stat dim">{abbr(totalDps)}<span class="unit">/s</span></span>
      {#if hpShare != null}
        <span class="stat hp">{(hpShare * 100).toFixed(1)}<span class="unit">%</span></span>
      {/if}
      {#if ttkMs != null}
        <span class="stat dim" title="Time to kill: how long the boss's remaining health lasts at the pace it has been falling">
          <span class="unit">TTK</span> {clock(ttkMs)}
        </span>
      {/if}
    {:else}
      <span class="title idle">{training ? "Waiting for a training dummy" : "Waiting for a boss"}</span>
    {/if}
    <span class="grow"></span>
    <button
      class="icon"
      class:on={training}
      title={training ? "Training mode: on (dummies only)" : "Training mode: off (bosses only)"}
      onclick={() => setSetting(KEYS.training, !training)}
    >
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></svg>
    </button>
    <button class="icon" title="Reset ({getSetting(KEYS.resetHotkey)}). Hide the meter: {getSetting(KEYS.hideHotkey)}" onclick={reset}>
      <svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
    </button>
    <button
      class="icon"
      class:news={update.version != null}
      title={update.version ? `Logs. Version ${update.version} is available: update from there.` : "Logs"}
      onclick={() => api.openLogs()}
    >
      <svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
    </button>
  </header>

  {#if hpShare != null && !drill}
    <div class="hpbar"><div style:width="{hpShare * 100}%"></div></div>
  {/if}

  {#if drill && snap}
    <div class="body">
      <SkillTable player={drill} seconds={Math.max(1, snap.battleTime / 1000)} compact />
    </div>
  {:else if fighting}
    <div class="body">
      <div class="col-head" style:grid-template-columns={COLS} style:column-gap={GAP}>
        <div></div>
        <div>DMG</div>
        <div>DPS</div>
        <div>D%</div>
        <div>Crit</div>
        <div>Back</div>
      </div>
      {#each rows as r (r.id)}
        {@const cls = classOf(r.job)}
        <button class="bar-row" style:grid-template-columns={COLS} style:column-gap={GAP} onclick={() => (selected = r.id)}>
          <div class="bar" style:width="{(r.amount / rows[0].amount) * 100}%" style:background={cls.color}></div>
          <div class="name" class:local={r.isLocal}>
            <ClassIcon {cls} size={20} />
            <span>{r.name}</span>
            {#if r.power > 0}<span class="power" title="Combat power">{full(r.power)}</span>{/if}
          </div>
          <div class="num">{abbr(r.amount)}</div>
          <div class="num">{abbr(r.dps)}</div>
          <div class="num">{(r.share * 100).toFixed(1)}<span class="unit">%</span></div>
          <div class="num">{r.stats ? pct(r.stats.crit, r.stats.hits) : "-"}</div>
          <div class="num">{r.stats ? pct(r.stats.back, r.stats.hits) : "-"}</div>
        </button>
      {/each}
    </div>
  {/if}

  <footer>
    <div class="scope">
      {#each SCOPES as s (s.key)}
        <button class:active={scope === s.key} title={s.hint} onclick={() => setSetting(KEYS.scope, s.key)}>{s.label}</button>
      {/each}
    </div>
    {#if status && !status.locked}
      <span class="warn">game connection not found</span>
    {/if}
    <span class="grow"></span>
    {#if ping != null}
      <span>{ping}<span class="unit">ms</span></span>
    {/if}
  </footer>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="resize" title="Drag to change the width" onpointerdown={startResize}></div>
</div>

<style>
  .meter.hidden {
    width: 1px !important;
    height: 1px;
    overflow: hidden;
    opacity: 0;
  }
  .meter {
    display: flex;
    flex-direction: column;
    background: rgba(17, 17, 20, var(--alpha));
    border-radius: 4px;
    overflow: hidden;
    position: relative;
    font-size: 12.5px;
    --row-h: 26px;
  }
  .resize {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 5px;
    cursor: ew-resize;
  }
  .resize:hover {
    background: var(--accent);
    opacity: 0.5;
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 30px;
    padding: 0 6px 0 10px;
    background: rgba(39, 39, 44, var(--alpha));
  }
  .title {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .title.idle {
    font-weight: 400;
    color: var(--muted);
  }
  .stat {
    white-space: nowrap;
  }
  .stat.dim {
    color: var(--muted);
  }
  .stat.hp {
    color: var(--danger);
  }
  .grow {
    flex: 1;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    color: var(--muted);
    flex: none;
  }
  .icon:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text);
  }
  .icon.on {
    color: var(--accent);
  }
  /* A dot on the Logs button: a newer version is waiting there. */
  .icon.news {
    position: relative;
  }
  .icon.news::after {
    content: "";
    position: absolute;
    top: 3px;
    right: 3px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
  }
  .icon svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .hpbar {
    height: 3px;
    background: rgba(255, 255, 255, 0.08);
  }
  .hpbar > div {
    height: 100%;
    background: var(--danger);
    transition: width 0.4s ease;
  }
  .body {
    max-height: 420px;
    overflow-y: auto;
  }
  button.bar-row {
    width: 100%;
    text-align: left;
  }
  button.bar-row:hover {
    background: rgba(255, 255, 255, 0.06);
  }
  .bar-row .bar {
    opacity: 0.6;
  }
  .name.local {
    font-weight: 700;
  }
  .power {
    flex: none;
    font-size: 11px;
    font-weight: 400;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  footer {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 24px;
    padding: 0 10px;
    font-size: 11px;
    color: var(--faint);
    background: rgba(39, 39, 44, var(--alpha));
  }
  .scope {
    display: flex;
    gap: 2px;
    margin-left: -6px;
  }
  .scope button {
    padding: 2px 7px;
    border-radius: 3px;
    color: var(--faint);
  }
  .scope button:hover {
    color: var(--text);
  }
  .scope button.active {
    color: var(--text);
    background: rgba(255, 255, 255, 0.12);
  }
  .warn {
    color: var(--danger);
  }
</style>
