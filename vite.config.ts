// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Public (publishable) backend settings used only when the build has no .env,
// so the published site can always reach the backend.
const FALLBACK_URL = "https://iiuuvojznpiteowwhcch.supabase.co";
const FALLBACK_KEY = "sb_publishable_4NUKvuAlWTJU33zujaUK3g_VuOgJ9Rh";
const define: Record<string, string> = {};
if (!process.env.VITE_SUPABASE_URL) define["import.meta.env.VITE_SUPABASE_URL"] = JSON.stringify(FALLBACK_URL);
if (!process.env.VITE_SUPABASE_PUBLISHABLE_KEY) define["import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY"] = JSON.stringify(FALLBACK_KEY);

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: { define },
});
