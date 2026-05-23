/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WORKER_URL: string;
  readonly VITE_TEXT_MODE_DEFAULT?: string;
  readonly VITE_HUD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
