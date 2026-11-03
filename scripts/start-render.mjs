import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const required = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = required.filter(key => !process.env[key]);
if (missing.length) {
  console.error(`Set these private service environment settings in Render: ${missing.join(', ')}`);
  process.exit(1);
}
const entry = resolve('.output/server/index.mjs');
if (!existsSync(entry)) {
  console.error('Build first: bun run build:render');
  process.exit(1);
}
process.env.NODE_ENV = 'production';
process.env.HOST ||= '0.0.0.0';
process.env.PORT ||= '10000';
process.env.WAIT_CARD_FONT_PATH ||= resolve('.output/server/assets/groupgrub-bold.ttf');
await import(pathToFileURL(entry).href);
