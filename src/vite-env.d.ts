/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEV_PROXY?: string;
  readonly VITE_TEXT_MODE_DEFAULT?: string;
  readonly VITE_HUD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
