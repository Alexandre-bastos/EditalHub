import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: vercel({
    webAnalytics: {
      enabled: true,
    },
  }),
  ssr: {
    noExternal: ['@prisma/client', 'pdf-parse'],
  },
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
