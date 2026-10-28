import { spawnSync } from 'node:child_process';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const env = { ...process.env, NITRO_PRESET: 'node_server', VITE_AUTH_MODE: 'supabase' };
if (env.SUPABASE_URL) env.VITE_SUPABASE_URL ||= env.SUPABASE_URL;
if (env.SUPABASE_PUBLISHABLE_KEY) env.VITE_SUPABASE_PUBLISHABLE_KEY ||= env.SUPABASE_PUBLISHABLE_KEY;
if (env.SUPABASE_URL && env.VITE_SUPABASE_URL !== env.SUPABASE_URL) {
  throw new Error('SUPABASE_URL and VITE_SUPABASE_URL must point to the same project.');
}
// VITE_* variables ship to browsers. Never map the server service-role key.
for (const key of Object.keys(env).filter(key => key.startsWith('VITE_'))) {
  const value = env[key] ?? '';
  if (/SERVICE_ROLE|SECRET/i.test(key) || value.startsWith('sb_secret_') ||
      (env.SUPABASE_SERVICE_ROLE_KEY && value === env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error(`Remove server-only credentials from ${key} before building.`);
  }
}
const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { stdio: 'inherit', env });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (!existsSync('.output/server/index.mjs')) throw new Error('The Node server build is missing.');
mkdirSync('.output/server/assets', { recursive: true });
copyFileSync('public/fonts/groupgrub-bold.ttf', '.output/server/assets/groupgrub-bold.ttf');
console.log(`Render Node build ready: ${resolve('.output/server/index.mjs')}`);
