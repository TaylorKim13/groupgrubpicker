import { expect, test } from "bun:test";
import { renderWaitCard, waitCardInput } from "../src/lib/wait-card.server";
import { waitTimeCardUrl, waitTimeSmsUrl } from "../src/lib/share-wait";

test("wait card URLs round-trip restaurant names and snapshots through SMS", () => {
  const restaurant = { name: "Café & Grill #1", wait: 25 };
  const link = waitTimeCardUrl(restaurant, "https://groupgrub.example");
  expect(waitCardInput(new URL(link))).toEqual({ name: restaurant.name, minutes: 25 });
  for (const ua of ["iPhone", "Android"]) {
    const sms = waitTimeSmsUrl(restaurant, ua, "", 0, "https://groupgrub.example");
    expect(decodeURIComponent(sms.split("body=")[1]!)).toBe(link);
  }
});

test("invalid or missing wait-time inputs are rejected", () => {
  for (const query of ["name=Test&minutes=-1", "name=Test&minutes=301", "name=Test&minutes=NaN", "minutes=25", "name=Test", `name=${"x".repeat(121)}&minutes=25`]) {
    expect(waitCardInput(new URL(`https://example.com/wait?${query}`))).toBeNull();
  }
  expect(waitCardInput(new URL("https://example.com/wait?name=Test&minutes=0"))).toEqual({ name: "Test", minutes: 0 });
});

test("cards render as PNG at the dimensions advertised in metadata", async () => {
  const png = await renderWaitCard("Saffron & Smoke", 25);
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect(png.readUInt32BE(16)).toBe(1200);
  expect(png.readUInt32BE(20)).toBe(630);
  expect(await renderWaitCard("Saffron & Smoke", 25)).toBe(png);
});
