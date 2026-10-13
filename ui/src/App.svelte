<script lang="ts">
  import { view } from "./lib/api";
  import Meter from "./meter/Meter.svelte";
  import Logs from "./logs/Logs.svelte";

  // "main" is the overlay. Every tool window the backend can open (history,
  // details, settings) is the one Logs window here.
  if (view === "main") document.body.classList.add("meter");
</script>

{#if view === "main"}
  <Meter />
{:else}
  <Logs startOn={view === "settings" ? "settings" : "list"} />
{/if}
