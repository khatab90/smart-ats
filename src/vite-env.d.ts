/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "production" (default) or "test". Test builds may show devices registered with environment='test'. */
  readonly VITE_APP_ENV?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
