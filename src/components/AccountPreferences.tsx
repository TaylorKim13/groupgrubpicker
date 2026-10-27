import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { DEFAULT_SETTINGS, type RoomSettings } from "@/lib/restaurants";
import { SettingsSchema, type DistanceUnit } from "@/lib/settings";
import { geocodeAccountCenter, savePreferences } from "@/lib/account.functions";
import { RoomSettingsFields } from "./RoomSettingsFields";
import { Button } from "./ui/button";

export function AccountPreferences({
  initialSettings,
  initialUnit,
  refresh,
}: {
  initialSettings: RoomSettings | null;
  initialUnit: DistanceUnit;
  refresh: () => Promise<unknown>;
}) {
  const [settings, setSettings] = useState(initialSettings ?? DEFAULT_SETTINGS);
  const [unit, setUnit] = useState(initialUnit);
  const [busy, setBusy] = useState(false);
  const save = useServerFn(savePreferences);
  const geo = useServerFn(geocodeAccountCenter);
  async function persist(next: RoomSettings, nextUnit: DistanceUnit) {
    setBusy(true);
    try {
      const checked = SettingsSchema.safeParse(next);
      if (!checked.success)
        throw new Error(checked.error.issues[0]?.message ?? "Check your preferences");
      await save({ data: { settings: checked.data, distanceUnit: nextUnit } });
      setSettings(next);
      setUnit(nextUnit);
      await refresh();
      toast.success("Preferences saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save preferences");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-6 py-6">
      <div>
        <h2 className="text-2xl font-bold">Hosting preferences</h2>
        <p className="mt-2 text-muted-foreground">
          Start every new table with your defaults. You can change them for each group.
        </p>
      </div>
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          void persist(settings, unit);
        }}
      >
        <label className="block font-bold">
          Distance units
          <select
            className="ml-3 rounded-lg border-2 bg-card px-3 py-2"
            disabled={busy}
            value={unit}
            onChange={(e) => setUnit(e.target.value as DistanceUnit)}
          >
            <option value="mi">Miles</option>
            <option value="km">Kilometers</option>
          </select>
        </label>
        <RoomSettingsFields
          value={settings}
          onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
          unit={unit}
          geocode={(address) => geo({ data: { address } })}
          disabled={busy}
        />
        <div className="flex flex-wrap gap-3">
          <Button disabled={busy} type="submit">
            {busy ? "Saving…" : "Save preferences"}
          </Button>
          <Button
            disabled={busy}
            type="button"
            variant="outline"
            onClick={() => void persist(DEFAULT_SETTINGS, "mi")}
          >
            Reset to app defaults
          </Button>
        </div>
      </form>
    </section>
  );
}
