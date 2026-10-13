<script lang="ts">
  import { api } from "../lib/api";
  import { buffValues, EXCLUSIVE_BUFFS, setBuffValue } from "../lib/buffValues";
  import { buildBuffs, buildContribution, buildPlayers, localActorOf, rosterOf, type BuffKind } from "../lib/fight";
  import { abbr, clock, dateTime, full, pct } from "../lib/format";
  import { tablesReady } from "../lib/icons";
  import type { FightRecord } from "../lib/types";
  import BuffTable from "../components/BuffTable.svelte";
  import ClassIcon from "../components/ClassIcon.svelte";
  import DpsChart from "../components/DpsChart.svelte";
  import Rotation from "../components/Rotation.svelte";
  import SkillTable from "../components/SkillTable.svelte";

  let { id, onback }: { id: string; onback: () => void } = $props();

  type Tab = "damage" | "rotation" | BuffKind;
  const TABS: { key: Tab; label: string }[] = [
    { key: "damage", label: "Damage" },
    { key: "rotation", label: "Rotation" },
    { key: "party", label: "Party Buffs" },
    { key: "self", label: "Self Buffs" },
    { key: "boss", label: "Boss Debuffs" },
  ];

  let fight = $state<FightRecord | null>(null);
  let error = $state("");
  let tab = $state<Tab>("damage");
  let selected = $state<number | null>(null);
  let confirmingDelete = $state(false);
  let namesReady = $state(false);

  // svelte-ignore state_referenced_locally
  api.loadFight(id).then((f) => (fight = f)).catch((e) => (error = String(e)));
  tablesReady.then(() => (namesReady = true));

  // Dev only: ?tab=party&player=<actorId> opens a view directly for screenshots.
  if (import.meta.env.DEV) {
    const q = new URLSearchParams(location.search);
    if (q.get("tab")) tab = q.get("tab") as Tab;
    if (q.get("player")) selected = Number(q.get("player"));
  }

  const players = $derived(
    fight ? buildPlayers(fight.details, rosterOf(fight.actors), localActorOf(fight.actors)) : [],
  );
  const seconds = $derived(fight ? Math.max(1, fight.durationMs / 1000) : 1);
  const total = $derived(players.reduce((t, p) => t + p.damage, 0));
  const drill = $derived(selected != null ? (players.find((p) => p.id === selected) ?? null) : null);
  const buffColumns = $derived(
    fight && tab !== "damage" && tab !== "rotation" && namesReady
      ? buildBuffs(fight.buffs ?? [], tab, players, fight.targetId, fight.durationMs)
      : [],
  );
  // rDPS: damage with the part owed to a buff moved to who applied it.
  const values = $derived(buffValues());
  const moved = $derived(
    fight ? buildContribution(fight.buffs ?? [], players, fight.targetId, fight.durationMs, values, EXCLUSIVE_BUFFS) : null,
  );
  // Fights saved before each hit's damage was kept spread a skill's total evenly over its hits.
  const perHit = $derived(fight?.details.skills.some((s) => s.hitDamages?.length) ?? false);

  // Each number column is as wide as its heading and longest value, with a
  // gap between, so neighbours never run into each other.
  const COLS = "minmax(0,1fr) 64px 58px 58px 56px 50px 50px 60px 56px 64px 60px";
  const GAP = "16px";

  async function remove() {
    await api.deleteFight(id).catch(() => {});
    onback();
  }
</script>

<div class="page">
  <div class="crumbs">
    <button class="link" onclick={onback}>← Encounters</button>
    <span class="grow"></span>
    {#if confirmingDelete}
      <span class="dim">Delete this encounter?</span>
      <button class="link danger" onclick={remove}>Delete</button>
      <button class="link" onclick={() => (confirmingDelete = false)}>Cancel</button>
    {:else if fight}
      <button class="link" onclick={() => (confirmingDelete = true)}>Delete</button>
    {/if}
  </div>

  {#if error}
    <p class="empty">Could not open this encounter: {error}</p>
  {:else if !fight}
    <p class="empty">Loading…</p>
  {:else}
    <div class="summary">
      <h1>{fight.bossName || "Unknown"}</h1>
      <div class="facts">
        <div><span>Duration</span>{clock(fight.durationMs)}</div>
        <div><span>Total damage</span>{full(total)}</div>
        <div><span>Raid DPS</span>{abbr(total / seconds)}</div>
        <div><span>Date</span>{dateTime(fight.startTimeMs)}</div>
      </div>
    </div>

    <div class="tabs">
      {#each TABS as t (t.key)}
        <button class:active={tab === t.key && !drill} onclick={() => ((tab = t.key), (selected = null))}>{t.label}</button>
      {/each}
      {#if drill}
        <button class="active player">
          <ClassIcon cls={drill.cls} size={16} />
          {drill.name}
        </button>
      {/if}
    </div>

    <div class="panel">
      {#if drill}
        <SkillTable player={drill} {seconds} />
      {:else if tab === "damage"}
        <div class="col-head" style:grid-template-columns={COLS} style:column-gap={GAP}>
          <div>Player</div>
          <div>DMG</div>
          <div>DPS</div>
          <div title="DPS with the damage owed to a buff moved to who applied it. An estimate: it depends on the damage % set for each buff in the Party Buffs and Boss Debuffs tabs.">
            rDPS
          </div>
          <div>D%</div>
          <div>Crit</div>
          <div>Back</div>
          <div>Perfect</div>
          <div>Double</div>
          <div>Healing</div>
          <div>Taken</div>
        </div>
        {#each players as p (p.id)}
          {@const m = moved?.get(p.id)}
          <button class="bar-row" style:grid-template-columns={COLS} style:column-gap={GAP} onclick={() => (selected = p.id)}>
            <div class="bar" style:width="{(p.damage / (players[0].damage || 1)) * 100}%" style:background={p.cls.color}></div>
            <div class="name" class:local={p.isLocal}>
              <ClassIcon cls={p.cls} size={20} />
              <span>{p.name}</span>
              {#if p.combatPower}<small>{abbr(p.combatPower)} CP</small>{/if}
            </div>
            <div class="num">{abbr(p.damage)}</div>
            <div class="num">{abbr(p.dps)}</div>
            <div
              class="num"
              title={m ? `${abbr(m.received)} of their damage came from others' buffs\n${abbr(m.given)} of others' damage came from theirs` : ""}
            >
              {abbr((p.damage - (m?.received ?? 0) + (m?.given ?? 0)) / seconds)}
            </div>
            <div class="num">{(p.share * 100).toFixed(1)}<span class="unit">%</span></div>
            <div class="num">{pct(p.crit, p.hits)}</div>
            <div class="num">{pct(p.back, p.hits)}</div>
            <div class="num">{pct(p.perfect, p.hits)}</div>
            <div class="num">{pct(p.double, p.hits)}</div>
            <div class="num">{p.heal ? abbr(p.heal) : "-"}</div>
            <div class="num">{p.taken ? abbr(p.taken) : "-"}</div>
          </button>
        {/each}
      {:else if tab === "rotation"}
        <Rotation {players} durationMs={fight.durationMs} />
      {:else}
        <BuffTable {players} columns={buffColumns} kind={tab} {values} onvalue={setBuffValue} />
      {/if}
    </div>

    {#if tab === "damage" && !drill}
      <h2>DPS over time</h2>
      <div class="panel pad">
        <DpsChart
          {players}
          durationMs={fight.durationMs}
          boss={{ maxHp: fight.details.maxHp, history: fight.hpHistory, killed: fight.killed }}
        />
      </div>
    {:else if tab !== "damage" && tab !== "rotation" && !drill}
      <p class="note">
        Numbers are the share of each player's damage dealt while the effect was on:
        {tab === "boss" ? "debuffs the party kept on the boss." : tab === "party" ? "buffs received from someone else." : "buffs they put on themselves."}
        {tab === "self" ? "Hover an icon for its name" : "The line under an icon is who applied it; hover it for the name and the damage others dealt under it"},
        a number for how long the effect was on.
        {#if tab !== "self"}
          The bottom row is how much damage each effect adds, which is what rDPS on the Damage tab moves to who applied it: type the
          percentage from the skill's tooltip (it grows with the skill's level), or 0 for one that adds none.
        {/if}
        {#if !perHit}
          This fight was saved before each hit's damage was recorded, so every hit of a skill counts as its average.
        {/if}
      </p>
    {/if}
  {/if}
</div>

<style>
  .page {
    padding: 4px 20px 28px;
  }
  .crumbs {
    display: flex;
    align-items: center;
    gap: 14px;
    height: 28px;
  }
  .grow {
    flex: 1;
  }
  .link {
    color: var(--muted);
  }
  .link:hover {
    color: var(--text);
  }
  .link.danger {
    color: var(--danger);
  }
  .dim {
    color: var(--muted);
  }
  .summary {
    display: flex;
    align-items: flex-end;
    gap: 36px;
    margin: 6px 0 16px;
    flex-wrap: wrap;
  }
  h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
  }
  .facts {
    display: flex;
    gap: 28px;
    padding-bottom: 2px;
    font-size: 15px;
    font-weight: 600;
  }
  .facts span {
    display: block;
    font-size: 11px;
    font-weight: 400;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .tabs {
    display: flex;
    gap: 2px;
  }
  .tabs button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border-radius: 6px 6px 0 0;
    color: var(--muted);
  }
  .tabs button:hover {
    color: var(--text);
  }
  .tabs button.active {
    background: var(--panel);
    color: var(--text);
    box-shadow: inset 0 2px 0 var(--accent);
  }
  .panel {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 0 6px 6px 6px;
    overflow: hidden;
    --row-h: 30px;
  }
  .panel.pad {
    padding: 12px 12px 4px;
    border-radius: 6px;
  }
  .panel :global(.col-head) {
    height: 28px;
    border-bottom: 1px solid var(--line);
  }
  button.bar-row {
    width: 100%;
    text-align: left;
  }
  button.bar-row:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  .bar-row .bar {
    opacity: 0.55;
  }
  .name.local {
    font-weight: 700;
  }
  .name small {
    color: rgba(255, 255, 255, 0.6);
    font-size: 11px;
    font-weight: 400;
    flex: none;
  }
  h2 {
    margin: 22px 0 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .note {
    margin: 10px 2px;
    color: var(--muted);
    font-size: 12px;
  }
  .empty {
    margin-top: 60px;
    text-align: center;
    color: var(--muted);
  }
</style>
