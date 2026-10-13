<script lang="ts">
  import { buildCasts, type PlayerRow } from "../lib/fight";
  import { castTime, clock } from "../lib/format";
  import ClassIcon from "./ClassIcon.svelte";
  import GameIcon from "./GameIcon.svelte";

  let { players, durationMs }: { players: PlayerRow[]; durationMs: number } = $props();

  const ICON = 24;
  const MAX_ZOOM = 12;

  // svelte-ignore state_referenced_locally
  let playerId = $state((players.find((p) => p.isLocal) ?? players[0])?.id ?? null);
  let withPassives = $state(false);
  let viewport = $state(1000);
  /** null: pick a zoom at which icons mostly do not overlap. */
  let chosenZoom = $state<number | null>(null);

  const player = $derived(players.find((p) => p.id === playerId) ?? players[0] ?? null);
  const casts = $derived(player ? buildCasts(player, withPassives) : []);
  const duration = $derived(Math.max(1, durationMs));

  // One lane per skill, in the order the skills were first used.
  const lanes = $derived.by(() => {
    const bySkill = new Map<number, { code: number; name: string; casts: typeof casts }>();
    for (const c of casts) {
      let lane = bySkill.get(c.code);
      if (!lane) bySkill.set(c.code, (lane = { code: c.code, name: c.name, casts: [] }));
      lane.casts.push(c);
    }
    return [...bySkill.values()];
  });

  // The gap between casts of one skill that a quarter of them are closer than:
  // zoomed so that gap is an icon wide, most icons stand clear of each other.
  const autoZoom = $derived.by(() => {
    const gaps: number[] = [];
    for (const lane of lanes) {
      for (let i = 1; i < lane.casts.length; i++) gaps.push(lane.casts[i].t - lane.casts[i - 1].t);
    }
    if (!gaps.length) return 1;
    gaps.sort((a, b) => a - b);
    const tight = Math.max(250, gaps[Math.floor(gaps.length / 4)]);
    const fit = Math.max(1, viewport - ICON) / duration;
    return Math.min(MAX_ZOOM, Math.max(1, (ICON + 2) / tight / fit));
  });

  const zoom = $derived(chosenZoom ?? autoZoom);
  const width = $derived(Math.max(1, viewport - ICON) * zoom);
  const x = (t: number) => (t / duration) * width;

  const ticks = $derived.by(() => {
    const pxPerSecond = (width / duration) * 1000;
    const step = [1, 2, 5, 10, 15, 30, 60, 120, 300].find((s) => s * pxPerSecond >= 70) ?? 600;
    const out: number[] = [];
    for (let t = 0; t <= duration; t += step * 1000) out.push(t);
    return out;
  });

  const setZoom = (z: number) => (chosenZoom = Math.min(MAX_ZOOM, Math.max(1, z)));
</script>

{#if !player}
  <p class="empty">Nothing recorded for this fight.</p>
{:else}
  <div class="bar">
    {#each players as p (p.id)}
      <button class="who" class:active={p.id === player.id} onclick={() => (playerId = p.id)}>
        <ClassIcon cls={p.cls} size={16} />
        {p.name}
      </button>
    {/each}
    <span class="grow"></span>
    <label><input type="checkbox" bind:checked={withPassives} /> Show passive procs</label>
    <div class="zoom">
      <button title="Zoom out" onclick={() => setZoom(zoom / 1.5)}>−</button>
      <button title="Fit the whole fight" onclick={() => setZoom(1)}>Fit</button>
      <button title="Zoom in" onclick={() => setZoom(zoom * 1.5)}>+</button>
    </div>
  </div>

  <div class="scroll" bind:clientWidth={viewport}>
    <div class="timeline" style:width="{width + ICON}px">
      <div class="axis">
        {#each ticks as t (t)}
          <span style:left="{x(t)}px">{clock(t)}</span>
        {/each}
      </div>
      <div class="lanes">
        {#each ticks as t (t)}
          <i class="grid" style:left="{x(t)}px"></i>
        {/each}
        {#each lanes as lane (lane.code)}
          <div class="lane">
            {#each lane.casts as c, i (i)}
              <div
                class="cast"
                style:left="{x(c.t)}px"
                title="{c.name || `#${c.code}`} at {castTime(c.t)}{c.hits > 1 ? ` (${c.hits} hits)` : ''}"
              >
                <GameIcon skill={c.code} size={ICON} />
              </div>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  </div>
  <p class="note">
    {casts.length} casts. Each row is one skill and each icon one use of it, placed where it first hit; hover an icon for
    its name and time. Built from hits on the boss: hits of one skill less than 0.7s apart count as one cast, and a skill
    that hit nothing is not shown. Damage-over-time ticks are left out.
  </p>
{/if}

<style>
  .bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    padding: 10px 12px;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 5px;
    color: var(--muted);
    border: 1px solid transparent;
  }
  .who:hover {
    color: var(--text);
  }
  .who.active {
    color: var(--text);
    background: var(--panel-2);
    border-color: var(--line);
  }
  .grow {
    flex: 1;
  }
  label {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-right: 12px;
    color: var(--muted);
  }
  input[type="checkbox"] {
    accent-color: var(--accent);
  }
  .zoom {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 5px;
    overflow: hidden;
  }
  .zoom button {
    min-width: 28px;
    padding: 3px 8px;
    color: var(--muted);
  }
  .zoom button + button {
    border-left: 1px solid var(--line);
  }
  .zoom button:hover {
    color: var(--text);
    background: var(--panel-2);
  }
  .scroll {
    overflow-x: auto;
    margin: 0 12px;
    padding-bottom: 6px;
  }
  .timeline {
    position: relative;
  }
  .axis {
    position: relative;
    height: 20px;
  }
  .axis span {
    position: absolute;
    top: 2px;
    padding-left: 4px;
    font-size: 11px;
    color: var(--muted);
  }
  .lanes {
    position: relative;
  }
  .grid {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--line);
  }
  .lane {
    position: relative;
    height: 30px;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
  }
  .lane:nth-child(odd) {
    background: rgba(255, 255, 255, 0.02);
  }
  .cast {
    position: absolute;
    top: 3px;
    line-height: 0;
    border-radius: 3px;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
  }
  .cast:hover {
    z-index: 1;
    box-shadow: 0 0 0 2px var(--accent);
  }
  .note {
    margin: 10px 12px 12px;
    color: var(--faint);
    font-size: 12px;
    line-height: 1.45;
  }
  .empty {
    padding: 30px;
    text-align: center;
    color: var(--muted);
  }
</style>
