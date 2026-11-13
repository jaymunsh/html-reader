import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: { entry: 'src/agent/main.ts', formats: ['iife'], name: 'HtmlReaderAgent', fileName: () => 'agent.js' },
    outDir: 'public/__reader',
    emptyOutDir: true,
    copyPublicDir: false,
  },
});
