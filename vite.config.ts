import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { copyFileSync, cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

const repoRoot = dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig(async () => ({

  // The UI lives in ui/ (Svelte). The upstream A2Tools page (index.html,
  // public/src/js, src/styles.css) is left where it is and is not built.
  root: join(repoRoot, "ui"),
  publicDir: join(repoRoot, "public"),
  build: {
    outDir: join(repoRoot, "dist"),
    emptyOutDir: true,
  },

  plugins: [svelte(), {
    name: "ui-resources",
    configResolved(config) {
      const dataDir = join(config.publicDir, "data");
      mkdirSync(dataDir, { recursive: true });
      copyFileSync(join(repoRoot, "src/data/skill_icons.json"), join(dataDir, "skill_icons.json"));
      // Buff icons for the Buffs tab.
      copyFileSync(join(repoRoot, "src/data/abnormals.json"), join(dataDir, "abnormals.json"));
      cpSync(join(repoRoot, "src/data/i18n"), join(config.publicDir, "i18n"), { recursive: true });
    },
  }],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
