import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  /* Must match the path the build is actually served from. GitHub Pages serves this as a
     project site under /Nexus/ (the Pages workflow sets BASE_PATH); Render and local dev
     serve it at the domain root. Getting this wrong is not cosmetic: with a non-root base
     the preview server 302s "/" to an ABSOLUTE url built from its own bind port, which on
     Render pointed at the unreachable internal port 10000 and timed out the browser. */
  base: process.env.BASE_PATH || '/',
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        auth: fileURLToPath(new URL('./auth.html', import.meta.url)),
        signup: fileURLToPath(new URL('./signup.html', import.meta.url)),
        dashboard: fileURLToPath(new URL('./dashboard.html', import.meta.url)),
        settings: fileURLToPath(new URL('./settings.html', import.meta.url)),
        harvestlink: fileURLToPath(new URL('./harvestlink.html', import.meta.url)),
      },
    },
  },
});
