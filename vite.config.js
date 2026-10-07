import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Arena proxies previews under *.e2b.app; allow the proxied host while
    // retaining Vite's Host-header protection for unrelated domains.
    allowedHosts: ['.e2b.app', 'localhost', '127.0.0.1'],
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
