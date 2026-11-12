import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function compile(file, replacements = {}) {
  let source = ts.transpileModule(
    await readFile(new URL(`../src/lib/${file}`, import.meta.url), "utf8"),
    {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    },
  ).outputText;
  for (const [name, value] of Object.entries(replacements))
    source = source.replaceAll(JSON.stringify(name), JSON.stringify(value));
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
const restaurants = await compile("restaurants.ts");
const dining = await compile("dining.ts", {
  zod: import.meta.resolve("zod"),
  "./restaurants": restaurants,
});
const conversation = await compile("dining-conversation.ts", {
  zod: import.meta.resolve("zod"),
  "./dining": dining,
  "./restaurants": restaurants,
});
const { conversationWav, ConversationPreferencesSchema } = await import(conversation);
const { analyzeDiningConversation, getConversationCooldown } = await import(
  await compile("dining-conversation.server.ts", {
    "./dining-conversation": conversation,
    "./dining": dining,
    "./restaurants": restaurants,
  })
);
const audio = Buffer.from(conversationWav([new Float32Array(48000).fill(0.25)], 48000)).toString(
  "base64",
);
const config = { key: "test-private-key", model: "test-model" };
const preferences = {
  summary: "Italian sounds good; distance was not discussed.",
  favoriteCuisines: ["Italian"],
  dislikedCuisines: null,
  maxPrice: null,
  maxDistanceKm: null,
  diets: null,
  novelty: null,
};
const reply = (data) =>
  new Response(
    JSON.stringify({
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: JSON.stringify(data) }] },
        },
      ],
    }),
    { status: 200 },
  );

test("recorder produces bounded mono 16 kHz PCM WAV from browser sample rates", () => {
  const wav = Buffer.from(conversationWav([new Float32Array(48000).fill(2)], 48000));
  assert.equal(wav.length, 32044);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt32LE(24), 16000);
  assert.equal(wav.readUInt32LE(40), 32000);
  assert.equal(wav.readInt16LE(44), 32767);
  const long = conversationWav([new Float32Array(16000 * 61)], 16000);
  assert.equal(long.byteLength, 1_920_044);
});

test("Gemini receives only audio, validates preferences, and does not save or auto-apply them", async () => {
  const result = await analyzeDiningConversation(audio, "success", config, async (url, options) => {
    assert.match(url, /models\/test-model:generateContent$/);
    assert.equal(options.headers["x-goog-api-key"], config.key);
    const body = JSON.parse(options.body);
    assert.deepEqual(body.contents[0].parts, [
      { inlineData: { mimeType: "audio/wav", data: audio } },
    ]);
    assert.equal(options.redirect, "error");
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    return reply(preferences);
  });
  assert.deepEqual(result, preferences);
  assert.equal("participating" in result, false);
  assert.equal("useHistory" in result, false);
});

test("missing configuration, invalid audio, and short recordings never call Gemini", async () => {
  const request = () => {
    assert.fail("must not call upstream");
  };
  await assert.rejects(
    analyzeDiningConversation(audio, "missing", { model: "test-model" }, request),
    /configured/,
  );
  await assert.rejects(
    analyzeDiningConversation(Buffer.alloc(100).toString("base64"), "invalid", config, request),
    /record between/,
  );
  const short = Buffer.from(conversationWav([new Float32Array(8000)], 16000)).toString("base64");
  await assert.rejects(
    analyzeDiningConversation(short, "short", config, request),
    /record between/,
  );
});

test("malformed, conflicting, or overbroad preferences cannot become accepted results", async () => {
  assert.equal(
    ConversationPreferencesSchema.safeParse({ ...preferences, useHistory: true }).success,
    false,
  );
  assert.equal(
    ConversationPreferencesSchema.safeParse({ ...preferences, diets: ["invented"] }).success,
    false,
  );
  assert.equal(
    ConversationPreferencesSchema.safeParse({ ...preferences, dislikedCuisines: ["Italian"] })
      .success,
    false,
  );
  await assert.rejects(
    analyzeDiningConversation(audio, "bad-result", config, async () =>
      reply({ ...preferences, maxPrice: 99 }),
    ),
    /couldn't understand/,
  );
});

test("repeat analyses are throttled and upstream failures disclose no private details", async () => {
  await analyzeDiningConversation(audio, "throttled", config, async () => reply(preferences));
  await assert.rejects(
    analyzeDiningConversation(audio, "throttled", config, () => assert.fail("cooldown")),
    /wait a minute/,
  );
  await assert.rejects(
    analyzeDiningConversation(audio, "upstream-error", config, async () => {
      throw new Error(`sensitive body ${config.key}`);
    }),
    (err) => !err.message.includes(config.key) && err.message.includes("enter preferences"),
  );
  await assert.rejects(
    analyzeDiningConversation(
      audio,
      "refusal",
      config,
      async () =>
        new Response(
          JSON.stringify({
            candidates: [{ finishReason: "SAFETY" }],
          }),
        ),
    ),
    /couldn't understand/,
  );
});

test("recording availability reports the remaining cooldown and unlocks at expiry", async () => {
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    assert.equal(getConversationCooldown("availability-seat"), 0);
    await analyzeDiningConversation(audio, "availability-seat", config, async () =>
      reply(preferences),
    );
    assert.equal(getConversationCooldown("availability-seat"), 60_000);
    now += 35_000;
    assert.equal(getConversationCooldown("availability-seat"), 25_000);
    now += 25_000;
    assert.equal(getConversationCooldown("availability-seat"), 0);
    await analyzeDiningConversation(audio, "availability-seat", config, async () =>
      reply(preferences),
    );
    assert.equal(getConversationCooldown("availability-seat"), 60_000);
  } finally {
    Date.now = originalNow;
  }
});
