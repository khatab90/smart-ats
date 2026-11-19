/// <reference types="vite/client" />

/** package.json version, injected at build time (vite.config.ts). */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** "production" (default) or "test". Test builds may show devices registered with environment='test'. */
  readonly VITE_APP_ENV?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
