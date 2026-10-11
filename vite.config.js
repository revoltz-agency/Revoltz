import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function publicMarketingEntry() {
  return {
    name: 'revoltz-public-marketing-entry',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const combinedEntry = 'src="/src/main.jsx"';
        if (!html.includes(combinedEntry)) {
          throw new Error('Public build could not find the combined app entry; refusing to bundle AgencyOS by mistake.');
        }
        return html.replace(combinedEntry, 'src="/src/site-main.jsx"');
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const publicSiteOnly = env.VITE_PUBLIC_SITE_ONLY === 'true';

  return {
    plugins: [react(), ...(publicSiteOnly ? [publicMarketingEntry()] : [])],
    server: {
      // Arena proxies previews under *.e2b.app; allow the proxied host while
      // retaining Vite's Host-header protection for unrelated domains.
      allowedHosts: ['.e2b.app', 'localhost', '127.0.0.1'],
    },
    build: {
      target: 'es2022',
      sourcemap: false,
    },
  };
});
