<script lang="ts">
  import type { PlayerRow } from "../lib/fight";
  import { abbr, pct } from "../lib/format";
  import GameIcon from "./GameIcon.svelte";

  // `compact` is the meter's version: fewer columns.
  let { player, seconds, compact = false }: { player: PlayerRow; seconds: number; compact?: boolean } = $props();

  const top = $derived(player.skills[0]?.damage || 1);
  const cols = $derived(
    compact
      ? "minmax(0,1fr) 48px 44px 50px 40px 40px 40px"
      : "minmax(0,1fr) 64px 58px 56px 46px 50px 50px 60px 56px 58px 58px 46px",
  );
  // Between the number columns, so neighbours never run into each other.
  const gap = $derived(compact ? "8px" : "16px");
</script>

<div class="col-head" style:grid-template-columns={cols} style:column-gap={gap}>
  <div>Skill</div>
  <div>DMG</div>
  <div>DPS</div>
  <div>D%</div>
  <div>Casts</div>
  <div>Crit</div>
  <div>Back</div>
  {#if !compact}
    <div>Perfect</div>
    <div>Double</div>
    <div>Avg</div>
    <div>Max</div>
    <div>Hits</div>
  {/if}
</div>
{#each player.skills as s (s.code + (s.isDot ? "d" : ""))}
  <div class="bar-row" style:grid-template-columns={cols} style:column-gap={gap}>
    <div class="bar" style:width="{(s.damage / top) * 100}%" style:background={player.cls.color}></div>
    <div class="name">
      <GameIcon skill={s.code} size={20} />
      <span>{s.name || `#${s.code}`}</span>
    </div>
    <div class="num">{abbr(s.damage)}</div>
    <div class="num">{abbr(s.damage / seconds)}</div>
    <div class="num">{pct(s.damage, player.damage)}<span class="unit">%</span></div>
    <div class="num">{s.casts || "-"}</div>
    <div class="num">{s.isDot ? "-" : pct(s.crit, s.hits)}</div>
    <div class="num">{s.isDot ? "-" : pct(s.back, s.hits)}</div>
    {#if !compact}
      <div class="num">{s.isDot ? "-" : pct(s.perfect, s.hits)}</div>
      <div class="num">{s.isDot ? "-" : pct(s.double, s.hits)}</div>
      <div class="num">{abbr(s.hits ? s.damage / s.hits : 0)}</div>
      <div class="num">{abbr(s.maxHit)}</div>
      <div class="num">{s.hits}</div>
    {/if}
  </div>
{/each}

<style>
  .bar {
    opacity: 0.55;
  }
</style>
