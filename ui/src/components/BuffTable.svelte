<script lang="ts">
  import type { BuffColumn, BuffKind, PlayerRow } from "../lib/fight";
  import { abbr } from "../lib/format";
  import { abnormalName } from "../lib/icons";
  import ClassIcon from "./ClassIcon.svelte";
  import GameIcon from "./GameIcon.svelte";

  // With `values` (percent of damage each effect adds, by column key) and
  // `onvalue`, a last row lets them be set.
  let {
    players,
    columns,
    kind,
    values = {},
    onvalue,
  }: {
    players: PlayerRow[];
    columns: BuffColumn[];
    kind: BuffKind;
    values?: Record<string, number>;
    onvalue?: (key: string, value: number | null) => void;
  } = $props();

  const grid = $derived(`minmax(160px, 1fr) repeat(${columns.length}, 52px)`);
  const byId = $derived(new Map(players.map((p) => [p.id, p])));
  const share = (v: number) => `${(v * 100).toFixed(0)}%`;

  /** The icon's hover text: the effect, who applied it, and what it covered. */
  function about(c: BuffColumn): string {
    const lines = [abnormalName(c.id)];
    if (kind === "self") return lines[0];
    const casters = c.casters.map((id) => byId.get(id)).filter((p) => p != null);
    if (casters.length) lines.push(`Applied by ${casters.map((p) => p.name).join(", ")}`);
    const others = players.filter((p) => !c.casters.includes(p.id)).reduce((sum, p) => sum + p.damage, 0);
    if (others > 0) lines.push(`${abbr(c.given)} of the others' damage dealt under it (${share(c.given / others)})`);
    return lines.join("\n");
  }

  /** Empty goes back to the starting value; anything that is not a number is put back as it was. */
  function typed(key: string, input: HTMLInputElement) {
    const text = input.value.trim().replace(",", ".").replace("%", "");
    const value = Number(text);
    if (text === "") onvalue?.(key, null);
    else if (Number.isFinite(value) && value >= 0 && value <= 500) onvalue?.(key, value);
    input.value = String(values[key] ?? "");
  }
</script>

{#if !columns.length}
  <p class="empty">Nothing recorded for this fight.</p>
{:else}
  <div class="scroll">
    <div class="head" style:grid-template-columns={grid}>
      <div></div>
      {#each columns as c (c.key)}
        <div class="buff" title={about(c)}>
          <GameIcon abnormal={c.id} skill={c.skill} size={24} />
          {#if kind !== "self"}
            <div class="by">
              {#each c.casters as id (id)}
                <i style:background={byId.get(id)?.cls.color}></i>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
    {#each players as p (p.id)}
      <div class="bar-row" style:grid-template-columns={grid}>
        <div class="bar" style:width="100%" style:background={p.cls.color}></div>
        <div class="name" class:local={p.isLocal}>
          <ClassIcon cls={p.cls} size={20} />
          <span>{p.name}</span>
        </div>
        {#each columns as c (c.key)}
          {@const cell = c.cells.get(p.id)}
          <div
            class="num cell"
            title={cell ? `${share(cell.damage)} of ${p.name}'s damage dealt under it\nOn for ${share(cell.time)} of the fight` : ""}
          >
            {cell && cell.damage >= 0.005 ? (cell.damage * 100).toFixed(0) : ""}
          </div>
        {/each}
      </div>
    {/each}
    {#if onvalue && kind !== "self"}
      <div class="values" style:grid-template-columns={grid}>
        <div class="label">Damage it adds, %</div>
        {#each columns as c (c.key)}
          <input
            value={values[c.key] ?? ""}
            placeholder="-"
            inputmode="decimal"
            title="How much damage {abnormalName(c.id)} adds, in percent, from the skill's tooltip. Used for rDPS."
            onchange={(e) => typed(c.key, e.currentTarget)}
            onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .scroll {
    overflow-x: auto;
  }
  .head {
    display: grid;
    align-items: center;
    height: 40px;
    padding: 0 8px 0 4px;
  }
  .buff {
    display: grid;
    justify-items: center;
    gap: 3px;
  }
  /* Who applied it, in their class colour. */
  .by {
    display: flex;
    gap: 2px;
    height: 3px;
  }
  .by i {
    width: 10px;
    height: 3px;
    border-radius: 2px;
  }
  .bar-row .bar {
    opacity: 0.28;
  }
  .cell {
    text-align: center;
  }
  .values {
    display: grid;
    align-items: center;
    height: 34px;
    padding: 0 8px 0 4px;
    border-top: 1px solid var(--line);
  }
  .label {
    padding-left: 6px;
    color: var(--muted);
    font-size: 12px;
  }
  .values input {
    justify-self: center;
    width: 42px;
    height: 22px;
    padding: 0 2px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.25);
    color: var(--text);
    font: inherit;
    font-size: 12px;
    text-align: center;
  }
  .values input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .name.local {
    font-weight: 700;
  }
  .empty {
    padding: 30px;
    text-align: center;
    color: var(--muted);
  }
</style>
