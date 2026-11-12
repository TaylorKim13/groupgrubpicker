import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
function luminance(hex) {
  const channels = hex
    .slice(1)
    .match(/../g)
    .map((part) => parseInt(part, 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
for (const selector of [":root", ".dark"]) {
  test(`${selector} keeps text, voting choices and filled buttons readable`, () => {
    const block = css.slice(css.indexOf(`${selector} {`)).split("}")[0];
    const colors = Object.fromEntries(
      [...block.matchAll(/--([\w-]+):\s*(#[a-f\d]{6});/gi)].map((match) => [match[1], match[2]]),
    );
    for (const [text, surface] of [
      ["foreground", "background"],
      ["card-foreground", "card"],
      ["brand", "card"],
      ["brand", "background"],
      ["muted-foreground", "muted"],
      ["muted-foreground", "card"],
      ["primary-foreground", "primary"],
      ["olive-foreground", "olive"],
      ["success-foreground", "success"],
      ["deal-foreground", "deal-background"],
      ["field-placeholder", "field-background"],
    ]) {
      const ratio = contrast(colors[text], colors[surface]);
      assert.ok(ratio >= 4.5, `${text} on ${surface}: ${ratio.toFixed(2)}:1`);
    }
    for (const surface of ["background", "card", "field-background"])
      assert.ok(contrast(colors.ring, colors[surface]) >= 3, `focus ring on ${surface}`);
    assert.notEqual(
      colors.brand,
      colors.primary,
      "text accents remain independent of button fills",
    );
  });
}
