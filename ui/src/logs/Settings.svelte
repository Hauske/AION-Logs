<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { getBool, getNumber, getSetting, KEYS, setSetting } from "../lib/settings.svelte";
  import { installUpdate, update } from "../lib/update.svelte";
  import type { CaptureStatus } from "../lib/types";

  let status = $state<CaptureStatus | null>(null);
  let admin = $state(true);
  let version = $state("");
  /** What "Check now" found, in words. */
  let checked = $state("");

  /** The shortcut waiting for a key press, if any. */
  let recording = $state<string | null>(null);

  const NAMED: Record<string, string> = {
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Space: "Space",
    Enter: "Enter",
    Tab: "Tab",
    Backspace: "Backspace",
    Insert: "Insert",
    Delete: "Delete",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
  };

  // Global shortcuts need a modifier, or the key would stop working in the game.
  function record(e: KeyboardEvent) {
    if (!recording) return;
    e.preventDefault();
    if (e.code === "Escape") {
      recording = null;
      return;
    }
    const key = /^Key[A-Z]$/.test(e.code)
      ? e.code.slice(3)
      : /^Digit\d$/.test(e.code)
        ? e.code.slice(5)
        : /^F([1-9]|1[0-2])$/.test(e.code)
          ? e.code
          : NAMED[e.code];
    const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift"].filter(Boolean);
    if (!key || !mods.length) return;
    setSetting(recording, [...mods, key].join("+"));
    recording = null;
  }

  async function checkForUpdate() {
    checked = "Checking…";
    try {
      checked = (await api.checkForUpdate()) ? "" : "You have the latest version.";
    } catch (e) {
      checked = `Could not check: ${e}`;
    }
  }

  onMount(() => {
    const read = () => api.captureStatus().then((s) => (status = s)).catch(() => {});
    read();
    api.isAdmin().then((a) => (admin = a));
    api.appVersion().then((v) => (version = v));
    const timer = setInterval(read, 3000);
    return () => clearInterval(timer);
  });
</script>

<div class="page">
  <h2>Connection</h2>
  <div class="card">
    <div class="line">
      <div>
        <strong>Game connection</strong>
        <p>
          {#if !admin}
            Not running as administrator, so packets cannot be captured. Close the app and start it as administrator.
          {:else if status?.locked}
            Connected{status.device ? ` on ${status.device}` : ""}.
          {:else}
            Not found yet. Start AION2 and log in to a character.
          {/if}
        </p>
      </div>
      <span class="dot" class:ok={admin && status?.locked}></span>
    </div>
    <div class="line">
      <div>
        <strong>Character</strong>
        <p>{status?.characterName || "Not identified yet"}</p>
      </div>
    </div>
  </div>

  <h2>Meter</h2>
  <div class="card">
    <label class="line">
      <div>
        <strong>Training mode</strong>
        <p>Show training dummies instead of bosses. Off, the meter shows boss fights and nothing else.</p>
      </div>
      <input type="checkbox" checked={getBool(KEYS.training)} onchange={(e) => setSetting(KEYS.training, e.currentTarget.checked)} />
    </label>
    <label class="line">
      <div>
        <strong>Background opacity</strong>
        <p>{getNumber(KEYS.opacity)}%</p>
      </div>
      <input type="range" min="30" max="100" step="5" value={getNumber(KEYS.opacity)} oninput={(e) => setSetting(KEYS.opacity, e.currentTarget.value)} />
    </label>
    <label class="line">
      <div>
        <strong>Width</strong>
        <p>{getNumber(KEYS.width)} px</p>
      </div>
      <input type="range" min="360" max="900" step="20" value={getNumber(KEYS.width)} oninput={(e) => setSetting(KEYS.width, e.currentTarget.value)} />
    </label>
  </div>

  <h2>Encounters</h2>
  <div class="card">
    <div class="line">
      <div>
        <strong>Encounters per page</strong>
        <p>How many rows the encounter list shows before the next page.</p>
      </div>
      <div class="choice">
        {#each [10, 15, 20] as n (n)}
          <button class:on={(getNumber(KEYS.perPage) || 20) === n} onclick={() => setSetting(KEYS.perPage, n)}>{n}</button>
        {/each}
      </div>
    </div>
  </div>

  <h2>Shortcuts</h2>
  <div class="card">
    {#each [{ key: KEYS.hideHotkey, name: "Hide or show the meter", hint: "Stays hidden until pressed again. It keeps recording while hidden." }, { key: KEYS.resetHotkey, name: "Reset the meter", hint: "Clears the current fight from the meter. A boss fight in progress is saved first." }] as s (s.key)}
      <div class="line">
        <div>
          <strong>{s.name}</strong>
          <p>{s.hint}</p>
        </div>
        <button
          class="keys"
          class:recording={recording === s.key}
          onclick={() => (recording = recording === s.key ? null : s.key)}
          onkeydown={record}
          onblur={() => recording === s.key && (recording = null)}
        >
          {recording === s.key ? "Press keys…" : getSetting(s.key)}
        </button>
      </div>
    {/each}
    <div class="line">
      <p class="hint">
        Click a shortcut, then press the new one: Ctrl, Alt or Shift plus a key. They work while the game is focused. A
        combination another program already uses will not respond.
      </p>
    </div>
  </div>

  <h2>About</h2>
  <div class="card">
    <div class="line">
      <div>
        <strong>AION Logs {version}</strong>
        <p>
          Packet capture and combat parsing by
          <button class="link" onclick={() => api.openUrl("https://github.com/taengu/A2Tools-DPS-Meter")}>A2Tools DPS Meter</button>
          (GPL-3.0). The interface is modelled on
          <button class="link" onclick={() => api.openUrl("https://github.com/snoww/loa-logs")}>LOA Logs</button>. This program is
          GPL-3.0 as well.
        </p>
      </div>
      <button class="quit" onclick={() => api.quit()}>Quit</button>
    </div>
    <div class="line">
      <div>
        <strong>Updates</strong>
        <p>
          {#if update.progress != null}
            {update.progress < 100 ? `Downloading version ${update.version}: ${update.progress}%` : "Installing… the meter closes and reopens."}
          {:else if update.error}
            The update could not be installed: {update.error}
          {:else if update.version}
            Version {update.version} is available. Updating closes the meter and reopens it.
          {:else}
            {checked || "Looked for when the meter starts and every hour after."}
          {/if}
        </p>
      </div>
      {#if update.version}
        <button class="quit go" disabled={update.progress != null} onclick={installUpdate}>Update now</button>
      {:else}
        <button class="quit" onclick={checkForUpdate}>Check now</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .page {
    padding: 0 20px 28px;
  }
  h2 {
    margin: 20px 0 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
  }
  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 12px 16px;
  }
  .line + .line {
    border-top: 1px solid var(--line);
  }
  strong {
    font-weight: 600;
  }
  p {
    margin: 3px 0 0;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.45;
  }
  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: var(--accent);
    flex: none;
  }
  input[type="range"] {
    width: 200px;
    accent-color: var(--accent);
    flex: none;
  }
  .choice {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 5px;
    overflow: hidden;
    flex: none;
  }
  .choice button {
    min-width: 44px;
    padding: 6px 10px;
    color: var(--muted);
  }
  .choice button + button {
    border-left: 1px solid var(--line);
  }
  .choice button:hover {
    color: var(--text);
  }
  .choice button.on {
    color: var(--text);
    background: var(--panel-2);
    box-shadow: inset 0 -2px 0 var(--accent);
  }
  .keys {
    min-width: 130px;
    padding: 6px 12px;
    border: 1px solid var(--line);
    border-radius: 5px;
    background: var(--panel-2);
    font-variant-numeric: tabular-nums;
    flex: none;
  }
  .keys:hover,
  .keys.recording {
    border-color: var(--accent);
  }
  .keys.recording {
    color: var(--accent);
  }
  .hint {
    margin: 0;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--danger);
    flex: none;
  }
  .dot.ok {
    background: #4ade80;
  }
  .link {
    color: var(--accent);
  }
  .quit {
    padding: 6px 14px;
    border: 1px solid var(--line);
    border-radius: 5px;
    flex: none;
  }
  .quit:hover {
    background: var(--panel-2);
  }
  .quit.go {
    border-color: var(--accent);
    color: var(--accent);
  }
  .quit:disabled {
    opacity: 0.5;
  }
</style>
