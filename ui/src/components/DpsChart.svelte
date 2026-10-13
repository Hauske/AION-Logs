<script lang="ts">
  import { bossHpLine, dpsSeries, healthAt, type BossHealth, type PlayerRow } from "../lib/fight";
  import { abbr, castTime, clock } from "../lib/format";

  // Without `boss`, or when its health is not known, there is no health line.
  let { players, durationMs, boss = null }: { players: PlayerRow[]; durationMs: number; boss?: BossHealth | null } = $props();

  let W = $state(1000);
  const H = 240;
  const PAD = { l: 48, r: 44, t: 10, b: 22 };

  // Left to right is time, start to end of the fight. Damage is averaged over
  // equal slices of about 2s, at most 60 of them, each drawn at its middle;
  // the boss's health is drawn where each reading fell.
  const duration = $derived(Math.max(1, durationMs));
  const count = $derived(Math.max(1, Math.min(60, Math.round(duration / 2000))));
  const slice = $derived(duration / count);
  const series = $derived(players.map((p) => ({ p, values: dpsSeries(p, duration, count) })));
  const hp = $derived(boss ? bossHpLine(players, duration, boss) : null);
  const peak = $derived(Math.max(1, ...series.flatMap((s) => s.values)));

  const x = (t: number) => PAD.l + (t / duration) * Math.max(1, W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (v / peak) * (H - PAD.t - PAD.b);
  const yShare = (share: number) => H - PAD.b - share * (H - PAD.t - PAD.b);
  const at2 = (px: number, py: number) => `${px.toFixed(1)},${py.toFixed(1)}`;

  // Held level from the first slice's middle back to the start, and from the
  // last one's on to the end, so the line spans the fight.
  const dpsLine = (values: number[]) =>
    [
      at2(x(0), y(values[0])),
      ...values.map((v, i) => at2(x((i + 0.5) * slice), y(v))),
      at2(x(duration), y(values[values.length - 1])),
    ].join(" ");

  /** What the drawn line reads at `t`. */
  function dpsAt(values: number[], t: number): number {
    const pos = t / slice - 0.5;
    if (pos <= 0) return values[0];
    if (pos >= values.length - 1) return values[values.length - 1];
    const i = Math.floor(pos);
    return values[i] + (values[i + 1] - values[i]) * (pos - i);
  }

  const yTicks = $derived([0, 0.5, 1].map((f) => f * peak));
  const xTicks = $derived.by(() => {
    const pxPerSecond = Math.max(1, W - PAD.l - PAD.r) / (duration / 1000);
    const step = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find((s) => s * pxPerSecond >= 70) ?? 1200;
    const out: number[] = [];
    for (let t = 0; t <= duration; t += step * 1000) out.push(t);
    return out;
  });

  // The moment under the mouse, in ms from the start.
  let hover = $state<number | null>(null);
  // Dev only: ?hover=<seconds> shows the tooltip for screenshots.
  if (import.meta.env.DEV) {
    const h = new URLSearchParams(location.search).get("hover");
    if (h) hover = Number(h) * 1000;
  }

  function move(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const share = (e.clientX - rect.left - PAD.l) / Math.max(1, W - PAD.l - PAD.r);
    hover = Math.min(1, Math.max(0, share)) * duration;
  }

  const at = $derived.by(() => {
    if (hover == null) return null;
    const t = Math.min(duration, Math.max(0, hover));
    const rows = series.map((s) => ({ p: s.p, dps: dpsAt(s.values, t) })).sort((a, b) => b.dps - a.dps);
    // The box lists who was dealing damage then, the top few on a crowded boss.
    const active = rows.filter((r) => r.dps >= 0.5);
    return {
      t,
      rows,
      listed: active.slice(0, 8),
      unlisted: Math.max(0, active.length - 8),
      total: rows.reduce((sum, r) => sum + r.dps, 0),
      hp: hp ? healthAt(hp, t) : null,
      // Keep the box inside the chart: left of the cursor past the middle.
      flip: x(t) > W / 2,
    };
  });
</script>

<div class="legend">
  {#each players as p (p.id)}
    <span><i style:background={p.cls.color}></i>{p.name}</span>
  {/each}
  {#if hp}
    <span><i class="hp"></i>Boss HP</span>
  {/if}
</div>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="chart" bind:clientWidth={W} onmousemove={move} onmouseleave={() => (hover = null)}>
  <svg viewBox="0 0 {W} {H}" width={W} height={H}>
    {#each yTicks as v, i (i)}
      <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} class="grid" />
      <text x={PAD.l - 6} y={y(v) + 4} text-anchor="end">{abbr(v)}</text>
      {#if hp}
        <text class="hp" x={W - PAD.r + 6} y={y(v) + 4}>{i * 50}%</text>
      {/if}
    {/each}
    {#each xTicks as t (t)}
      <text x={x(t)} y={H - 6} text-anchor="middle">{clock(t)}</text>
    {/each}
    {#if hp}
      <polyline class="hpline" points={hp.map((p) => at2(x(p.t), yShare(p.share))).join(" ")} />
    {/if}
    {#each series as s (s.p.id)}
      <polyline points={dpsLine(s.values)} stroke={s.p.cls.color} />
    {/each}
    {#if at}
      <line class="cursor" x1={x(at.t)} x2={x(at.t)} y1={PAD.t} y2={H - PAD.b} />
      {#if at.hp != null}
        <circle class="hpdot" cx={x(at.t)} cy={yShare(at.hp)} r="3.5" />
      {/if}
      {#each at.rows as r (r.p.id)}
        <circle cx={x(at.t)} cy={y(r.dps)} r="3.5" fill={r.p.cls.color} />
      {/each}
    {/if}
  </svg>

  {#if at}
    <div class="tip" class:flip={at.flip} style:left="{x(at.t)}px">
      <div class="when">{castTime(at.t)}</div>
      {#if hp}
        <div class="row">
          <i class="hp"></i><span>Boss HP</span><b>{at.hp != null ? `${(at.hp * 100).toFixed(1)}%` : "no reading"}</b>
        </div>
      {/if}
      {#each at.listed as r (r.p.id)}
        <div class="row"><i style:background={r.p.cls.color}></i><span>{r.p.name}</span><b>{abbr(r.dps)}</b></div>
      {/each}
      {#if at.unlisted > 0}
        <div class="row more"><i></i><span>{at.unlisted} more</span></div>
      {/if}
      <div class="row total"><i></i><span>Raid DPS</span><b>{abbr(at.total)}</b></div>
    </div>
  {/if}
</div>

<style>
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    padding: 0 2px 8px;
    font-size: 12px;
    color: var(--muted);
  }
  .legend span {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  i {
    display: inline-block;
    width: 10px;
    height: 3px;
    border-radius: 2px;
    flex: none;
  }
  i.hp {
    background: var(--danger);
  }
  .chart {
    position: relative;
    width: 100%;
    height: 240px;
  }
  svg {
    display: block;
  }
  .grid {
    stroke: var(--line);
    stroke-width: 1;
  }
  polyline {
    fill: none;
    stroke-width: 2;
    stroke-linejoin: round;
  }
  .hpline {
    stroke: var(--danger);
    stroke-width: 2;
    stroke-dasharray: 5 4;
    opacity: 0.85;
  }
  .cursor {
    stroke: var(--muted);
    stroke-width: 1;
    stroke-dasharray: 3 3;
  }
  circle {
    stroke: var(--panel);
    stroke-width: 1.5;
  }
  .hpdot {
    fill: var(--danger);
  }
  text {
    fill: var(--muted);
    font-size: 11px;
  }
  text.hp {
    fill: var(--danger);
  }
  .tip {
    position: absolute;
    top: 8px;
    transform: translateX(14px);
    min-width: 170px;
    padding: 8px 10px;
    background: rgba(24, 24, 27, 0.96);
    border: 1px solid var(--line);
    border-radius: 6px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
    pointer-events: none;
    font-size: 12px;
    white-space: nowrap;
  }
  .tip.flip {
    transform: translateX(calc(-100% - 14px));
  }
  .when {
    margin-bottom: 6px;
    color: var(--muted);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 18px;
  }
  .row span {
    flex: 1;
  }
  .row.total {
    margin-top: 4px;
    padding-top: 4px;
    height: 22px;
    border-top: 1px solid var(--line);
    color: var(--muted);
  }
  .row.total i,
  .row.more i {
    background: transparent;
  }
  .row.more {
    color: var(--muted);
  }
</style>
