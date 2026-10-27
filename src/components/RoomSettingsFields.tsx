import { useState } from "react";
import { toast } from "sonner";
import { DIETS, priceLabel, type Center, type RoomSettings } from "@/lib/restaurants";
import { fromKm, toKm, type DistanceUnit, type RoomPreferences } from "@/lib/settings";
import { Button } from "./ui/button";

export function RoomSettingsFields({
  value,
  onChange,
  unit,
  geocode,
  disabled = false,
}: {
  value: RoomPreferences & { center?: Center };
  onChange: (patch: Partial<RoomSettings>) => void;
  unit: DistanceUnit;
  geocode?: (address: string) => Promise<Center>;
  disabled?: boolean;
}) {
  const [address, setAddress] = useState("");
  const [locating, setLocating] = useState(false);
  const input = "mt-2 w-full rounded-lg border-2 bg-background px-3 py-2";
  return (
    <fieldset disabled={disabled} className="space-y-5 disabled:opacity-60">
      {geocode && value.center && (
        <div>
          <label htmlFor="search-address" className="font-bold">
            Search location
          </label>
          <p className="text-sm text-muted-foreground">{value.center.label}</p>
          <div className="flex gap-2">
            <input
              id="search-address"
              className={input}
              value={address}
              maxLength={200}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Address or neighborhood"
            />
            <Button
              type="button"
              className="mt-2"
              disabled={locating || address.trim().length < 2}
              onClick={async () => {
                setLocating(true);
                try {
                  onChange({ center: await geocode(address) });
                  setAddress("");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Location lookup failed");
                } finally {
                  setLocating(false);
                }
              }}
            >
              {locating ? "Finding…" : "Set"}
            </Button>
          </div>
          <Button
            type="button"
            variant="link"
            disabled={locating}
            onClick={() => {
              if (!navigator.geolocation) {
                toast.error("Location is unavailable in this browser");
                return;
              }
              setLocating(true);
              navigator.geolocation.getCurrentPosition(
                (p) => {
                  onChange({
                    center: {
                      lat: p.coords.latitude,
                      lng: p.coords.longitude,
                      label: "My location",
                    },
                  });
                  setLocating(false);
                },
                () => {
                  toast.error("Couldn't get your location");
                  setLocating(false);
                },
                { timeout: 15000 },
              );
            }}
          >
            Use my location
          </Button>
        </div>
      )}
      <label className="block font-bold">
        Maximum distance ({unit})
        <input
          key={unit}
          aria-label={`Maximum distance in ${unit}`}
          type="number"
          required
          className={input}
          min={Number(fromKm(0.5, unit).toFixed(6))}
          max={Number(fromKm(40, unit).toFixed(6))}
          step="any"
          value={Number(fromKm(value.radiusKm, unit).toFixed(6))}
          onChange={(e) => {
            const n = e.target.valueAsNumber;
            if (Number.isFinite(n)) {
              const radiusKm =
                n === Number(fromKm(40, unit).toFixed(6))
                  ? 40
                  : n === Number(fromKm(0.5, unit).toFixed(6))
                    ? 0.5
                    : toKm(n, unit);
              onChange({ radiusKm });
            }
          }}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        {(["priceMin", "priceMax"] as const).map((key) => (
          <label key={key} className="font-bold">
            {key === "priceMin" ? "Minimum price" : "Maximum price"}
            <select
              className={input}
              value={value[key]}
              onChange={(e) => onChange({ [key]: Number(e.target.value) })}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {priceLabel(n)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <fieldset>
        <legend className="mb-2 font-bold">Dietary / allergy needs</legend>
        <div className="flex flex-wrap gap-2">
          {DIETS.map((d) => (
            <Button
              type="button"
              key={d}
              aria-pressed={value.diets.includes(d)}
              variant={value.diets.includes(d) ? "secondary" : "outline"}
              onClick={() =>
                onChange({
                  diets: value.diets.includes(d)
                    ? value.diets.filter((x) => x !== d)
                    : [...value.diets, d],
                })
              }
            >
              {d}
            </Button>
          ))}
        </div>
      </fieldset>
      <label className="block font-bold">
        Maximum wait (minutes)
        <input
          className={input}
          type="number"
          required
          min={5}
          max={180}
          step={1}
          value={value.maxWait}
          onChange={(e) => {
            if (Number.isFinite(e.target.valueAsNumber))
              onChange({ maxWait: e.target.valueAsNumber });
          }}
        />
      </label>
      <label className="flex items-center justify-between font-bold">
        Public lobby
        <input
          type="checkbox"
          checked={value.visibility === "public"}
          onChange={(e) => onChange({ visibility: e.target.checked ? "public" : "private" })}
        />
      </label>
      <label className="flex items-center justify-between font-bold">
        Anonymous voting
        <input
          type="checkbox"
          checked={value.anonymous}
          onChange={(e) => onChange({ anonymous: e.target.checked })}
        />
      </label>
    </fieldset>
  );
}
