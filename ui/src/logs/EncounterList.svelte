<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { classOf } from "../lib/classes";
  import { abbr, clock, dateTime } from "../lib/format";
  import { getBool, getNumber, KEYS, setSetting } from "../lib/settings.svelte";
  import type { FightSummary } from "../lib/types";
  import ClassIcon from "../components/ClassIcon.svelte";

  let { onopen }: { onopen: (id: string) => void } = $props();

  let fights = $state<FightSummary[] | null>(null);
  let search = $state("");
  // Saved with the settings, so it is still set after the window is closed.
  const showTraining = $derived(getBool(KEYS.showTraining));

  async function refresh() {
    fights = await api.fights().catch(() => fights ?? []);
  }

  let refreshing = $state(false);

  // The list also refreshes itself every 10 seconds. Held for a moment so
  // the press is seen to have done something.
  async function refreshNow() {
    refreshing = true;
    await Promise.all([refresh(), new Promise((done) => setTimeout(done, 400))]);
    refreshing = false;
  }

  const shown = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return (fights ?? [])
      .filter((f) => !f.isLive && (showTraining || !f.isTrain) && (!q || f.bossName.toLowerCase().includes(q)))
      .sort((a, b) => b.startTimeMs - a.startTimeMs);
  });

  // Numbered in the order they were fought, so the newest has the highest
  // number and clearing the history starts again from 1.
  const numbers = $derived.by(() => {
    const saved = (fights ?? []).filter((f) => !f.isLive).sort((a, b) => a.startTimeMs - b.startTimeMs);
    return new Map(saved.map((f, i) => [f.id, i + 1]));
  });

  const PER_PAGE = $derived([10, 15, 20].includes(getNumber(KEYS.perPage)) ? getNumber(KEYS.perPage) : 20);
  let page = $state(0);
  const pages = $derived(Math.max(1, Math.ceil(shown.length / PER_PAGE)));
  // Fewer results after a search or a delete can leave the page past the end.
  const current = $derived(Math.min(page, pages - 1));
  const visible = $derived(shown.slice(current * PER_PAGE, (current + 1) * PER_PAGE));
  // First, last, and the pages around the current one; 0 stands for a gap.
  const pageLinks = $derived.by(() => {
    const out: number[] = [];
    for (let p = 1; p <= pages; p++) {
      if (p === 1 || p === pages || Math.abs(p - 1 - current) <= 2) out.push(p);
      else if (out.at(-1) !== 0) out.push(0);
    }
    return out;
  });

  // Rows share the height of the window, so a page always fills it: fewer
  // per page means taller rows and larger text.
  // Worked out from the page, not from the list itself: the list's own height
  // follows the rows, so measuring it would chase its tail. In a window too
  // short for the rows at their smallest, the page scrolls instead.
  let pageH = $state(0);
  const room = $derived(pageH - 20 - 42 - (pages > 1 ? 42 : 0));
  const rowH = $derived(Math.max(28, Math.floor((room - 30) / PER_PAGE)));
  const fontPx = $derived(Math.min(20, Math.max(12, rowH * 0.3)));

  let confirmingClear = $state(false);
  let clearing = $state(false);

  async function clearHistory() {
    clearing = true;
    for (const f of (fights ?? []).filter((f) => !f.isLive)) {
      await api.deleteFight(f.id).catch(() => {});
    }
    clearing = false;
    confirmingClear = false;
    await refresh();
  }

  onMount(() => {
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  });
</script>

<div class="page" bind:clientHeight={pageH}>
  <div class="tools">
    <input type="search" placeholder="Search bosses" bind:value={search} oninput={() => (page = 0)} />
    <label><input type="checkbox" checked={showTraining} onchange={(e) => setSetting(KEYS.showTraining, e.currentTarget.checked)} /> Show training fights</label>
    <span class="grow"></span>
    <span class="count">{shown.length} encounter{shown.length === 1 ? "" : "s"}</span>
    <button class="act" title="Look for new encounters now" disabled={refreshing} onclick={refreshNow}>
      {refreshing ? "Refreshing…" : "Refresh"}
    </button>
    {#if confirmingClear}
      <span class="ask">Delete every saved encounter?</span>
      <button class="act danger" disabled={clearing} onclick={clearHistory}>{clearing ? "Deleting…" : "Delete all"}</button>
      <button class="act" disabled={clearing} onclick={() => (confirmingClear = false)}>Cancel</button>
    {:else if numbers.size}
      <button class="act" title="Delete every saved encounter and start numbering from 1 again" onclick={() => (confirmingClear = true)}>
        Clear history
      </button>
    {/if}
  </div>

  {#if fights == null}
    <p class="empty">Loading…</p>
  {:else if !shown.length}
    <p class="empty">
      {search ? "No encounters match that search." : "No encounters yet. Boss fights are saved here automatically when they end."}
    </p>
  {:else}
    <div class="list" style:--row-h="{rowH}px" style:--fs="{fontPx}px">
      <div class="row head">
        <div class="r">#</div>
        <div>Encounter</div>
        <div>Party</div>
        <div class="r">Duration</div>
        <div class="r">Damage</div>
        <div class="r">Raid DPS</div>
        <div class="r">When</div>
      </div>
      {#each visible as f (f.id)}
        <button
          class="row"
          class:clear={f.outcome === "clear"}
          class:wipe={f.outcome === "wipe"}
          title={f.outcome === "clear" ? "Cleared" : f.outcome === "wipe" ? "Wipe" : ""}
          onclick={() => onopen(f.id)}
        >
          <div class="r num">#{numbers.get(f.id) ?? ""}</div>
          <div class="boss">
            {f.bossName || "Unknown"}
            {#if f.isTrain}<span class="tag">training</span>{/if}
          </div>
          <div class="party">
            {#each f.memberJobs.length ? f.memberJobs : f.jobs as job, i (i)}
              <ClassIcon cls={classOf(job)} size={Math.round(fontPx * 1.45)} />
            {/each}
          </div>
          <div class="r">{clock(f.durationMs)}</div>
          <div class="r">{abbr(f.totalDamage)}</div>
          <div class="r">{abbr(f.totalDamage / Math.max(1, f.durationMs / 1000))}</div>
          <div class="r dim">{dateTime(f.startTimeMs)}</div>
        </button>
      {/each}
    </div>
    {#if pages > 1}
      <div class="pager">
        <button class="act" disabled={current === 0} onclick={() => (page = current - 1)}>Previous</button>
        {#each pageLinks as p, i (i)}
          {#if p === 0}
            <span class="gap">…</span>
          {:else}
            <button class="act" class:on={p - 1 === current} onclick={() => (page = p - 1)}>{p}</button>
          {/if}
        {/each}
        <button class="act" disabled={current === pages - 1} onclick={() => (page = current + 1)}>Next</button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    height: 100%;
    box-sizing: border-box;
    padding: 4px 20px 16px;
  }
  .tools,
  .list,
  .pager {
    flex: none;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 16px;
    height: 30px;
    margin-bottom: 12px;
  }
  input[type="search"] {
    width: 260px;
    height: 30px;
    padding: 0 10px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 5px;
    outline: none;
  }
  input[type="search"]:focus {
    border-color: var(--accent);
  }
  label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
  }
  input[type="checkbox"] {
    accent-color: var(--accent);
  }
  .grow {
    flex: 1;
  }
  .count {
    color: var(--faint);
  }
  .list {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    overflow: hidden;
  }
  .row {
    display: grid;
    grid-template-columns:
      calc(var(--fs) * 3.6) minmax(0, 1.6fr) minmax(0, 1.4fr) calc(var(--fs) * 5) calc(var(--fs) * 5.5)
      calc(var(--fs) * 5.5) calc(var(--fs) * 9.5);
    column-gap: 14px;
    align-items: center;
    width: 100%;
    height: var(--row-h);
    font-size: var(--fs);
    padding: 0 14px;
    text-align: left;
    border-top: 1px solid var(--line);
  }
  .row.head {
    height: 28px;
    border-top: 0;
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  button.row:hover {
    background: var(--panel-2);
  }
  /* Green number for a clear, red for a wipe; grey when the outcome is not known. */
  .row.clear .num {
    color: #4ade80;
    font-weight: 700;
  }
  .row.wipe .num {
    color: var(--danger);
    font-weight: 700;
  }
  .num {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .act {
    padding: 4px 10px;
    border: 1px solid var(--line);
    border-radius: 5px;
    color: var(--muted);
  }
  .act:hover {
    color: var(--text);
    background: var(--panel-2);
  }
  .act:disabled {
    opacity: 0.4;
    pointer-events: none;
  }
  .act.on {
    color: var(--text);
    background: var(--panel-2);
    border-color: var(--accent);
  }
  .pager {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 6px;
    height: 30px;
    margin-top: 12px;
  }
  .pager .act {
    min-width: 34px;
  }
  .gap {
    color: var(--faint);
  }
  .act.danger {
    color: var(--danger);
    border-color: var(--danger);
  }
  .ask {
    color: var(--text);
  }
  .boss {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tag {
    margin-left: 8px;
    padding: 1px 6px;
    border-radius: 3px;
    background: var(--panel-2);
    color: var(--muted);
    font-size: 11px;
    font-weight: 400;
  }
  .party {
    display: flex;
    gap: 3px;
    overflow: hidden;
  }
  .r {
    text-align: right;
  }
  .dim {
    color: var(--muted);
  }
  .empty {
    margin-top: 60px;
    text-align: center;
    color: var(--muted);
  }
</style>
