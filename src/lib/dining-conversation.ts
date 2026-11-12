import { z } from "zod";
import { CUISINES } from "./dining";
import { DIETS } from "./restaurants";

export const MAX_CONVERSATION_SECONDS = 60;
export const CONVERSATION_COOLDOWN_MS = 60_000;
export const MAX_CONVERSATION_BASE64 = 2_600_000;
export const ConversationAudioSchema = z.object({
  audio: z
    .string()
    .min(64)
    .max(MAX_CONVERSATION_BASE64)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
});

// Null means "not clearly discussed", so existing choices are preserved.
export const ConversationPreferencesSchema = z
  .object({
    summary: z.string().min(1).max(800),
    favoriteCuisines: z.array(z.enum(CUISINES)).max(10).nullable(),
    dislikedCuisines: z.array(z.enum(CUISINES)).max(10).nullable(),
    maxPrice: z.number().int().min(1).max(4).nullable(),
    maxDistanceKm: z.number().min(0.5).max(161).nullable(),
    diets: z
      .array(z.enum(DIETS as [(typeof DIETS)[number], ...(typeof DIETS)[number][]]))
      .max(6)
      .nullable(),
    novelty: z.enum(["balanced", "familiar", "new"]).nullable(),
  })
  .strict()
  .refine((p) => !p.favoriteCuisines?.some((c) => p.dislikedCuisines?.includes(c)), {
    message: "Conflicting cuisine preferences. Please record again or enter them manually.",
  });
export type ConversationPreferences = z.infer<typeof ConversationPreferencesSchema>;

/** Mono 16-bit WAV; resample browser audio to keep a minute below 2 MB. */
export function conversationWav(chunks: Float32Array[], sampleRate: number): ArrayBuffer {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const samples = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }
  const rate = 16000;
  const count = Math.min(rate * MAX_CONVERSATION_SECONDS, Math.floor((length * rate) / sampleRate));
  const buffer = new ArrayBuffer(44 + count * 2);
  const view = new DataView(buffer);
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + count * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const start = Math.floor((i * sampleRate) / rate);
    const end = Math.min(length, Math.max(start + 1, Math.floor(((i + 1) * sampleRate) / rate)));
    let sum = 0;
    for (let j = start; j < end; j++) sum += samples[j] ?? 0;
    const sample = Math.max(-1, Math.min(1, sum / (end - start)));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }
  return buffer;
}
