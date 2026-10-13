<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { api, inTauri, on, view } from "../lib/api";
  import { startSettings } from "../lib/settings.svelte";
  import { installUpdate, startUpdates, update } from "../lib/update.svelte";
  import EncounterList from "./EncounterList.svelte";
  import Encounter from "./Encounter.svelte";
  import Settings from "./Settings.svelte";

  let { startOn = "list" }: { startOn?: "list" | "settings" } = $props();

  // svelte-ignore state_referenced_locally
  let page = $state<"list" | "fight" | "settings">(startOn);
  let fightId = $state<string | null>(null);

  function open(id: string) {
    fightId = id;
    page = "fight";
  }

  function handleRequest(payload: unknown) {
    const p = payload as { kind?: string; fightId?: string } | null;
    if (p?.kind === "fight" && p.fightId) open(p.fightId);
  }

  const win = inTauri ? getCurrentWindow() : null;

  onMount(() => {
    startSettings();
    startUpdates();
    // The backend builds its tool windows always-on-top; a log browser
    // should not sit over the game.
    win?.setAlwaysOnTop(false).catch(() => {});
    api.toolWindowReady(view);
    api.takePendingRequest().then(handleRequest);
    return on<unknown>("details-request", handleRequest);
  });
</script>

<div class="window">
  <aside>
    <div class="app">AION Logs</div>
    <nav>
      <button class:active={page !== "settings"} onclick={() => (page = "list")}>
        <svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
        Encounters
      </button>
      <button class:active={page === "settings"} onclick={() => (page = "settings")}>
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></svg>
        Settings
      </button>
    </nav>
    {#if update.version}
      <div class="update">
        <strong>Update available</strong>
        <span>Version {update.version}</span>
        {#if update.progress != null}
          <div class="progress"><i style:width="{update.progress}%"></i></div>
          <span>{update.progress < 100 ? `Downloading ${update.progress}%` : "Installing…"}</span>
        {:else}
          <button title="Downloads and installs it. The meter closes and reopens." onclick={installUpdate}>Update now</button>
        {/if}
        {#if update.error}<span class="failed">{update.error}</span>{/if}
      </div>
    {/if}
  </aside>

  <div class="content">
    <div class="strip">
      <span class="grow"></span>
      <button class="ctl" title="Minimize" onclick={() => win?.minimize().catch(() => {})}>
        <svg viewBox="0 0 24 24"><path d="M5 12h14" /></svg>
      </button>
      <button class="ctl" title="Maximize" onclick={() => win?.toggleMaximize().catch(() => {})}>
        <svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="1" /></svg>
      </button>
      <button class="ctl close" title="Close" onclick={() => api.closeToolWindow()}>
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>

    <main>
      {#if page === "settings"}
        <Settings />
      {:else if page === "fight" && fightId}
        {#key fightId}
          <Encounter id={fightId} onback={() => (page = "list")} />
        {/key}
      {:else}
        <EncounterList onopen={open} />
      {/if}
    </main>
  </div>
</div>

<style>
  .window {
    display: flex;
    height: 100%;
    border: 1px solid var(--line);
  }
  /* The sidebar's empty space and the strip above the page move the window. */
  aside {
    display: flex;
    flex-direction: column;
    width: 176px;
    flex: none;
    background: var(--panel);
    border-right: 1px solid var(--line);
    -webkit-app-region: drag;
  }
  .app {
    padding: 14px 16px 16px;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.03em;
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 8px;
    -webkit-app-region: no-drag;
  }
  nav button {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 5px;
    color: var(--muted);
    text-align: left;
  }
  nav button:hover {
    color: var(--text);
    background: rgba(255, 255, 255, 0.04);
  }
  nav button.active {
    color: var(--text);
    background: var(--panel-2);
    box-shadow: inset 2px 0 0 var(--accent);
  }
  nav svg {
    width: 16px;
    height: 16px;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .update {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: auto 8px 10px;
    padding: 10px;
    border: 1px solid var(--accent);
    border-radius: 6px;
    font-size: 12px;
    color: var(--muted);
    -webkit-app-region: no-drag;
  }
  .update strong {
    color: var(--text);
    font-size: 13px;
  }
  .update button {
    margin-top: 6px;
    padding: 6px 0;
    border-radius: 5px;
    background: var(--accent);
    color: #18181b;
    font-weight: 600;
  }
  .update button:hover {
    filter: brightness(1.1);
  }
  .update .progress {
    height: 4px;
    margin-top: 6px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.1);
    overflow: hidden;
  }
  .update .progress i {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .update .failed {
    color: var(--danger);
  }
  .content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .strip {
    display: flex;
    height: 32px;
    flex: none;
    -webkit-app-region: drag;
  }
  .grow {
    flex: 1;
  }
  .ctl {
    display: grid;
    place-items: center;
    width: 42px;
    height: 100%;
    color: var(--muted);
    -webkit-app-region: no-drag;
  }
  .ctl:hover {
    background: var(--panel-2);
    color: var(--text);
  }
  .ctl.close:hover {
    background: #c42b3a;
    color: #fff;
  }
  .ctl svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
  }
  main {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
</style>
