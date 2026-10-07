import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APPS, uiPort } from '@openflow/desktop/apps.ts';
import { reachPort } from '@openflow/desktop/reach.ts';
import { truthWriter } from './harness/vite-truth.ts';
import { gridExport } from './harness/vite-export.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

// No fixed dev port: `OPENFLOW_MIX_UI_PORT` or `PORT` when something named one
// (a launcher's autoPort), otherwise 0 — a free port from the OS, which
// `tools/app.ts dev` reads off the socket and hands to the shell.
//
// Nothing to proxy. mix[flow] talks to no server: separation is a child process
// the main process runs, and what the renderer sees of it arrives over IPC.
const PORT = uiPort(APPS.mix);

// Where a browser tab reaches the running app. `tools/app.ts dev` picks a free
// port and sets `OPENFLOW_MIX_REACH_PORT` before this config is read, and the
// page is built with it. `npm run ui` alone has none (0), and the page says so.
const REACH = reachPort(APPS.mix);

/**
 * While serving, `electron` resolves to a browser stand-in, which is what lets
 * a browser tab run the app's own preload unchanged — `src/main.tsx` builds the
 * bridge itself when it finds no preload has.
 *
 * Keyed on `command` rather than on an environment variable because vite can be
 * started on its own (`npm run ui`), where it never sees `OPENFLOW_DEV`.
 * Serving is the same question anyway, and a `build` is left exactly as it
 * was — nothing in `src/` imports electron, and the preload the real app ships
 * is bundled by esbuild rather than by this config.
 */
export default defineConfig(({ command }) => ({
  root: here,
  define: { __MIX_REACH_PORT__: JSON.stringify(REACH) },
  resolve: {
    alias: (command === 'serve'
      ? { electron: fileURLToPath(import.meta.resolve('@openflow/desktop/reach-client.ts')) }
      : {}) as Record<string, string>,
  },
  // The harness page under harness/ saves hand-corrected beats through the dev server.
  plugins: [
    react(),
    truthWriter(path.resolve(here, 'harness', 'reports')),
    gridExport(path.resolve(here, 'harness', 'reports')),
  ],
  // Nothing may come from a CDN — this eventually runs on stage.
  build: {
    outDir: path.resolve(here, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    // A named port is a claim: busy, vite fails rather than drifting to one
    // nobody was told about. Unnamed, it is 0 and the OS picks.
    port: PORT,
    strictPort: PORT !== 0,
  },
}));
