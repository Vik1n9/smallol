import { defineConfig } from 'vitest/config';

// Tauri expects a fixed dev port and a static build in dist/.
export default defineConfig({
  clearScreen: false,
  server: { port: 1430, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  // Three pages: the bar, the notification window, and the optional windows (panel.html#minimap…).
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true, rollupOptions: { input: { main: 'index.html', notify: 'notify.html', panel: 'panel.html' } } },
  test: { include: ['tests/**/*.test.ts'] },
});
