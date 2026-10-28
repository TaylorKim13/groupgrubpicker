import * as PImage from "pureimage";
import { resolve } from "node:path";
import { Writable } from "node:stream";

export function waitCardInput(url: URL) {
  const name = url.searchParams.get("name")?.trim();
  const raw = url.searchParams.get("minutes");
  if (!name || name.length > 120 || !raw || !/^\d{1,3}$/.test(raw)) return null;
  const minutes = Number(raw);
  if (minutes > 300) return null;
  return { name, minutes };
}

let fontReady: Promise<void> | undefined;
const cache = new Map<string, Buffer>();
export async function renderWaitCard(name: string, minutes: number): Promise<Buffer> {
  const key = JSON.stringify([name, minutes]);
  const existing = cache.get(key);
  if (existing) return existing;
  fontReady ??= PImage.registerFont(resolve("public/fonts/groupgrub-bold.ttf"), "GroupGrub").load().then(() => undefined);
  await fontReady;
  const image = PImage.make(1200, 630);
  const ctx = image.getContext("2d");
  ctx.fillStyle = "#fff7df";
  ctx.fillRect(0, 0, 1200, 630);
  const text = (value: string, x: number, y: number, size: number, color = "#241a14") => {
    ctx.fillStyle = color;
    ctx.font = `${size}pt GroupGrub`;
    ctx.fillText(value, x, y);
  };
  text("GROUP GRUB", 65, 80, 28, "#db3329");
  // Fit names to three lines without cutting off long words.
  let size = 58;
  let lines: string[] = [];
  for (; size >= 20; size -= 2) {
    ctx.font = `${size}pt GroupGrub`;
    lines = [];
    let line = "";
    for (const character of Array.from(name)) {
      const candidate = line + character;
      if (line && ctx.measureText(candidate).width > 610) {
        const space = candidate.lastIndexOf(" ");
        if (space > 0) { lines.push(candidate.slice(0, space)); line = candidate.slice(space + 1); }
        else { lines.push(line); line = character; }
      } else line = candidate;
    }
    if (line) lines.push(line);
    if (lines.length <= 3) break;
  }
  lines.forEach((line, i) => text(line, 65, 220 + i * (size * 1.3), size));
  text("ESTIMATED WAIT", 67, 478, 27);
  text("A shared snapshot. Times may change.", 67, 528, 18, "#68584c");
  const circle = (x: number, y: number, radius: number, color: string) => {
    ctx.beginPath();
    for (let i = 0; i <= 256; i++) {
      const angle = (i / 256) * Math.PI * 2;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  };
  circle(946, 326, 213, "#241a14");
  circle(934, 312, 213, "#241a14");
  circle(934, 312, 205, "#ffcc38");
  const number = String(minutes);
  const numberSize = minutes >= 100 ? 154 : 184;
  ctx.font = `${numberSize}pt GroupGrub`;
  const numberWidth = ctx.measureText(number).width;
  text(number, 934 - numberWidth / 2, 350, numberSize, "#db3329");
  const label = minutes === 1 ? "MINUTE" : "MINUTES";
  ctx.font = "27pt GroupGrub";
  text(label, 934 - ctx.measureText(label).width / 2, 415, 27);
  const chunks: Buffer[] = [];
  const stream = new Writable({ write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
  await PImage.encodePNGToStream(image, stream);
  const buffer = Buffer.concat(chunks);
  // Bound memory for custom restaurant names; card pixels are always 1200x630.
  if (cache.size >= 32) cache.delete(cache.keys().next().value!);
  cache.set(key, buffer);
  return buffer;
}
