import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', ['VITE_', 'VERCEL_']);
  const previewDemoEnabled = env.VERCEL_ENV === 'preview';
  const input: Record<string, string> = { app: 'index.html' };

  if (previewDemoEnabled) {
    input.agentDemo = 'agent-demo.html';
  }

  return {
    plugins: [react()],
    define: {
      'globalThis.__SCHOLARSHIP_SCOUT_ENV__': JSON.stringify({
        VITE_SUPABASE_URL: env.VITE_SUPABASE_URL,
        VITE_SUPABASE_PUBLISHABLE_KEY: env.VITE_SUPABASE_PUBLISHABLE_KEY,
      }),
      'globalThis.__SCHOLARSHIP_SCOUT_PREVIEW_DEMO_ENABLED__': JSON.stringify(
        previewDemoEnabled,
      ),
    },
    build: {
      rollupOptions: { input },
    },
  };
});
