// The newer release the backend found, if any, and how far installing it is.
// The backend looks shortly after start and every hour, and tells every
// window; the interface offers it and nothing installs until asked.

import { api, on } from "./api";

export const update = $state<{
  /** The newer version, or null when this is the newest. */
  version: string | null;
  /** Download percent while it installs, else null. */
  progress: number | null;
  error: string;
}>({ version: null, progress: null, error: "" });

let started = false;

export function startUpdates() {
  if (started) return;
  started = true;
  api.availableUpdate().then((v) => (update.version = v));
  on<string | null>("update-available", (v) => (update.version = v));
  // Whichever window started it, each one shows it.
  on<number>("download-progress", (percent) => (update.progress = percent));
}

/** On success the app closes for the installer, so this only comes back with an error. */
export async function installUpdate() {
  if (update.progress != null) return;
  update.error = "";
  update.progress = 0;
  try {
    await api.installUpdate();
  } catch (e) {
    update.error = String(e);
    update.progress = null;
  }
}
