import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { beforeEach, after, test } from "node:test";
import ts from "typescript";

const moduleUrl = (text) => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
async function load(path, replacements = {}) {
  let source = ts.transpileModule(
    await readFile(new URL(`../src/lib/${path}`, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  for (const [name, target] of Object.entries(replacements))
    source = source.replaceAll(JSON.stringify(name), JSON.stringify(target));
  return moduleUrl(source);
}
const zod = import.meta.resolve("zod");
const avatarsUrl = await load("profile-avatar.ts", { zod });
const { AvatarSchema, profilePhotoPath, validateProfilePhotoFile, MAX_PHOTO_FILE_BYTES } =
  await import(avatarsUrl);
const restaurants = await load("restaurants.ts");
const settings = await load("settings.ts", { zod, "./restaurants": restaurants });
const rpc = moduleUrl(
  `export function createServerFn(){let validate;return{middleware(){return this;},inputValidator(fn){validate=fn;return this;},handler(fn){return async ({data,context}={})=>fn({data:validate?validate(data):data,context});}}}`,
);
const middleware = moduleUrl("export const requireSupabaseAuth = {};");
const admin = moduleUrl(
  "export const supabaseAdmin = {storage:{from:()=>globalThis.__photoTest.storage},auth:{admin:{deleteUser:async id=>{globalThis.__photoTest.deleted=id;return {error:null}}}}};",
);
const account = await load("account.functions.ts", {
  zod,
  "./settings": settings,
  "./profile-avatar": avatarsUrl,
  "@tanstack/react-start": rpc,
  "@/integrations/supabase/auth-middleware": middleware,
  "@/integrations/supabase/client.server": admin,
});
const { saveAccount, deleteAccount } = await import(account);
const userId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const base = "https://example.supabase.co/storage/v1/object/public/profile-photos/";
const oldPath = `${userId}/33333333-3333-4333-8333-333333333333.jpg`;
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0xff, 0xd9]).toString("base64");
let fixture;
beforeEach(() => {
  fixture = {
    profile: { display_name: "Aaron", avatar: "🍕" },
    objects: new Map(),
    uploadError: false,
    saveError: false,
    deleted: null,
    storage: {
      async upload(path, bytes) {
        if (fixture.uploadError) return { error: new Error("upload failed") };
        fixture.objects.set(path, bytes);
        return { error: null };
      },
      getPublicUrl(path) {
        return { data: { publicUrl: base + path } };
      },
      async remove(paths) {
        for (const path of paths) fixture.objects.delete(path);
        return { error: null };
      },
      async list(prefix) {
        return {
          data: [...fixture.objects.keys()]
            .filter((path) => path.startsWith(prefix + "/"))
            .map((path) => ({ name: path.split("/")[1] })),
          error: null,
        };
      },
    },
  };
  globalThis.__photoTest = fixture;
});
after(() => delete globalThis.__photoTest);
function context() {
  return {
    userId,
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({ single: async () => ({ data: { ...fixture.profile }, error: null }) }),
        }),
        update: (patch) => ({
          eq: async () => {
            if (fixture.saveError) return { error: new Error("save failed") };
            Object.assign(fixture.profile, patch);
            return { error: null };
          },
        }),
      }),
    },
  };
}
const save = (data) =>
  saveAccount({ data: { display_name: "Aaron", avatar: "🍕", ...data }, context: context() });

test("upload saves a photo URL and changing back to emoji removes the photo", async () => {
  const result = await save({ photo: jpeg });
  assert.ok(profilePhotoPath(result.avatar, userId));
  assert.equal(fixture.profile.avatar, result.avatar);
  assert.equal(fixture.objects.size, 1);
  await save({ avatar: "🌮" });
  assert.equal(fixture.profile.avatar, "🌮");
  assert.equal(fixture.objects.size, 0);
});
test("replacing a photo cleans up the previous object only after saving", async () => {
  fixture.profile.avatar = base + oldPath;
  fixture.objects.set(oldPath, Buffer.from("old"));
  const result = await save({ avatar: fixture.profile.avatar, photo: jpeg });
  assert.notEqual(result.avatar, base + oldPath);
  assert.equal(fixture.objects.has(oldPath), false);
  assert.equal(fixture.objects.size, 1);
});
test("upload and database failures preserve the previous profile and clean up failed uploads", async () => {
  fixture.profile.avatar = base + oldPath;
  fixture.objects.set(oldPath, Buffer.from("old"));
  fixture.uploadError = true;
  await assert.rejects(save({ photo: jpeg }), /Could not upload/);
  assert.equal(fixture.profile.avatar, base + oldPath);
  fixture.uploadError = false;
  fixture.saveError = true;
  await assert.rejects(save({ photo: jpeg }), /Could not save/);
  assert.equal(fixture.profile.avatar, base + oldPath);
  assert.deepEqual([...fixture.objects.keys()], [oldPath]);
});
test("profile saves reject arbitrary URLs, another user photo, and invalid photo bytes", async () => {
  await assert.rejects(save({ avatar: "https://tracker.example/photo.jpg" }));
  await assert.rejects(
    save({ avatar: base + oldPath.replace(userId, otherId) }),
    /own profile photo/,
  );
  await assert.rejects(
    save({ photo: Buffer.from("<svg></svg>").toString("base64") }),
    /Invalid photo/,
  );
  assert.equal(fixture.objects.size, 0);
});
test("saving a nickname preserves the existing owned photo", async () => {
  fixture.profile.avatar = base + oldPath;
  fixture.objects.set(oldPath, Buffer.from("old"));
  await save({ display_name: "New name", avatar: fixture.profile.avatar });
  assert.equal(fixture.profile.display_name, "New name");
  assert.equal(fixture.objects.has(oldPath), true);
});
test("account deletion removes only that account photo files", async () => {
  fixture.objects.set(oldPath, Buffer.from("own"));
  fixture.objects.set(oldPath.replace(userId, otherId), Buffer.from("other"));
  await deleteAccount({ data: { confirmation: "DELETE" }, context: context() });
  assert.equal(fixture.deleted, userId);
  assert.equal(fixture.objects.has(oldPath), false);
  assert.equal(fixture.objects.size, 1);
});
test("image selection and avatar validation retain emoji support and reject unsafe formats", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp"])
    assert.doesNotThrow(() => validateProfilePhotoFile({ type, size: 1000 }));
  assert.throws(() => validateProfilePhotoFile({ type: "image/svg+xml", size: 1000 }), /JPG/);
  assert.throws(
    () => validateProfilePhotoFile({ type: "image/png", size: MAX_PHOTO_FILE_BYTES + 1 }),
    /5 MB/,
  );
  assert.ok(AvatarSchema.safeParse("🍕").success);
  assert.ok(AvatarSchema.safeParse(base + oldPath).success);
  assert.equal(profilePhotoPath("javascript:alert(1)"), null);
  assert.equal(profilePhotoPath("data:image/svg+xml,test"), null);
  assert.equal(profilePhotoPath(base + oldPath, otherId), null);
});
