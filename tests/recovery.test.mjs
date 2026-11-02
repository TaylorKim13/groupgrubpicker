import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const moduleUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
async function compile(path) {
  return ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
const sharedUrl = moduleUrl(
  (await compile("../src/lib/recovery.ts")).replace(
    '"zod"',
    JSON.stringify(import.meta.resolve("zod")),
  ),
);
const { UsernameSchema, RecoverySchema, RECOVERY_MESSAGE, recoveryRedirect } = await import(
  sharedUrl
);
const { sendRecovery } = await import(
  moduleUrl(
    (await compile("../src/lib/recovery.server.ts")).replace(
      '"./recovery"',
      JSON.stringify(sharedUrl),
    ),
  )
);

test("email and username inputs are normalized and invalid identifiers rejected", () => {
  assert.equal(UsernameSchema.parse(" Taylor_13 "), "taylor_13");
  assert.deepEqual(RecoverySchema.parse({ kind: "email", identifier: " Test@Example.com " }), {
    kind: "email",
    identifier: "test@example.com",
  });
  for (const value of ["ab", "a b", "name%", "x".repeat(25)])
    assert.equal(UsernameSchema.safeParse(value).success, false);
  assert.equal(RecoverySchema.safeParse({ kind: "email", identifier: "not-email" }).success, false);
  assert.equal(RecoverySchema.safeParse({ kind: "other", identifier: "test" }).success, false);
});

test("reset redirect uses configured origin, ignores paths, and rejects unsafe origins", () => {
  const request = new Request("https://site.example/account");
  assert.equal(recoveryRedirect(request), "https://site.example/reset-password");
  assert.equal(
    recoveryRedirect(request, "https://canonical.example/anything"),
    "https://canonical.example/reset-password",
  );
  assert.equal(
    recoveryRedirect(new Request("http://localhost:3000/account")),
    "http://localhost:3000/reset-password",
  );
  for (const origin of [
    "http://public.example",
    "https://user:pass@site.example",
    "javascript:alert(1)",
  ]) {
    assert.throws(() => recoveryRedirect(request, origin));
  }
});

function fakeClient(resolved, lookupError = null, deliveryError = null) {
  const calls = [];
  return {
    calls,
    client: {
      rpc: async (...args) => {
        calls.push(["rpc", ...args]);
        return { data: resolved, error: lookupError };
      },
      auth: {
        resetPasswordForEmail: async (...args) => {
          calls.push(["send", ...args]);
          return { error: deliveryError };
        },
      },
    },
  };
}

test("username resolves privately and sends only to the stored account email", async () => {
  const { client, calls } = fakeClient("saved@example.com");
  const result = await sendRecovery(
    client,
    { kind: "username", identifier: " Taylor_13 ", email: "attacker@example.com" },
    "https://site.example/reset-password",
    "127.0.0.1",
  );
  assert.deepEqual(calls, [
    [
      "rpc",
      "resolve_grub_recovery",
      { p_kind: "username", p_identifier: "taylor_13", p_requester: "127.0.0.1" },
    ],
    ["send", "saved@example.com", { redirectTo: "https://site.example/reset-password" }],
  ]);
  assert.deepEqual(result, { message: RECOVERY_MESSAGE });
  assert.equal(JSON.stringify(result).includes("saved@example.com"), false);
});

test("unknown and throttled accounts have the same public response without email delivery", async () => {
  const { client, calls } = fakeClient(null);
  assert.deepEqual(
    await sendRecovery(
      client,
      { kind: "email", identifier: "unknown@example.com" },
      "https://site.example/reset-password",
      "ip",
    ),
    { message: RECOVERY_MESSAGE },
  );
  assert.equal(calls.length, 1);
});

test("delivery errors do not reveal accounts; infrastructure failures allow retry", async () => {
  const logs = [];
  const original = console.error;
  console.error = (...args) => logs.push(args);
  try {
    const failed = fakeClient("private@example.com", null, {
      code: "email_address_not_authorized",
      message: "private@example.com",
    });
    assert.deepEqual(
      await sendRecovery(
        failed.client,
        { kind: "username", identifier: "user" },
        "https://site.example/reset-password",
        "ip",
      ),
      { message: RECOVERY_MESSAGE },
    );
    const unavailable = fakeClient(null, { code: "PGRST202", message: "sensitive detail" });
    await assert.rejects(
      sendRecovery(
        unavailable.client,
        { kind: "username", identifier: "user" },
        "https://site.example/reset-password",
        "ip",
      ),
      /temporarily unavailable/,
    );
    assert.equal(JSON.stringify(logs).includes("private@example.com"), false);
    assert.equal(JSON.stringify(logs).includes("sensitive detail"), false);
  } finally {
    console.error = original;
  }
});

test("invalid inputs never invoke the lookup or mail provider", async () => {
  const { client, calls } = fakeClient("saved@example.com");
  await assert.rejects(
    sendRecovery(
      client,
      { kind: "username", identifier: "%" },
      "https://site.example/reset-password",
      "ip",
    ),
  );
  assert.equal(calls.length, 0);
});
