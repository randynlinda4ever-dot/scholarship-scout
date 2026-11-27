/// <reference types="vite/client" />

declare global {
  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL?: string;
    readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  var __SCHOLARSHIP_SCOUT_PREVIEW_DEMO_ENABLED__: boolean | undefined;
}

export {};
