import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteAccount,
  saveAccount,
  saveRewardRestaurants,
  searchRewardPlaces,
} from "@/lib/account.functions";
import {
  googleMapsPlaceUrl,
  normalizeRestaurantName,
  type RewardPlaceSearchResult,
  type RewardRestaurant,
} from "@/lib/restaurant-rewards";
import { ProfilePicker } from "./ProfilePicker";
import { ProfileAvatar } from "./ProfileAvatar";
import { prepareProfilePhoto } from "@/lib/prepare-profile-photo";
import { isProfilePhoto } from "@/lib/profile-avatar";
import { AVATARS } from "@/lib/restaurants";
import { ExternalLink, MapPin, Search, Gift } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "./ui/dialog";

export function AccountSettings({
  user,
  profile,
  rewardRestaurants: initialRewardRestaurants,
  usernameAvailable = true,
  refresh,
  leave,
}: {
  user: User;
  profile: { display_name: string; avatar: string; username?: string | null };
  rewardRestaurants: RewardRestaurant[];
  usernameAvailable?: boolean;
  refresh: () => Promise<unknown>;
  leave: (deleted?: boolean) => Promise<void>;
}) {
  const [nickname, setNickname] = useState(profile.display_name);
  const [username, setUsername] = useState(profile.username ?? "");
  const [avatar, setAvatar] = useState(profile.avatar);
  const [rewardRestaurants, setRewardRestaurants] = useState(initialRewardRestaurants);
  const [rewardQuery, setRewardQuery] = useState("");
  const [rewardResults, setRewardResults] = useState<RewardPlaceSearchResult[]>([]);
  const [selectedReward, setSelectedReward] = useState<RewardPlaceSearchResult | null>(null);
  const [searchingRewards, setSearchingRewards] = useState(false);
  const [rewardSearchComplete, setRewardSearchComplete] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [deletion, setDeletion] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = useServerFn(saveAccount);
  const saveRewards = useServerFn(saveRewardRestaurants);
  const findRewardPlaces = useServerFn(searchRewardPlaces);
  const remove = useServerFn(deleteAccount);
  const queryClient = useQueryClient();
  const providers = [...new Set(user.identities?.map((i) => i.provider) ?? [])];
  const hasPassword = providers.includes("email");
  const input = "mt-2 w-full rounded-lg border bg-card px-4 py-3";
  async function act(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save changes");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="divide-y">
      <section className="py-6">
        <h2 className="mb-4 text-2xl font-bold">Your profile</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              const saved = await save({
                data: {
                  display_name: nickname,
                  avatar,
                  ...(photo ? { photo } : {}),
                  ...(usernameAvailable && username.trim() ? { username } : {}),
                },
              });
              setAvatar(saved.avatar);
              setPhoto(null);
              await refresh();
              toast.success("Profile saved");
            });
          }}
        >
          <fieldset disabled={busy || preparingPhoto}>
            {usernameAvailable && (
              <label className="mb-5 block font-bold">
                Recovery username
                <input
                  className={input}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required={!!profile.username}
                  minLength={3}
                  maxLength={24}
                  pattern="[A-Za-z0-9_]{3,24}"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                />
                <span className="mt-1 block text-sm font-normal text-muted-foreground">
                  A unique username with 3–24 letters, numbers, or underscores. If you forget your
                  email, use this to request a reset email.
                </span>
              </label>
            )}
            <div className="mb-5 space-y-3">
              <h3 className="font-bold">Profile photo</h3>
              <ProfileAvatar
                avatar={photo ? `data:image/jpeg;base64,${photo}` : avatar}
                name={nickname || "Your"}
                preview
                className="h-24 w-24 border bg-card text-4xl"
              />
              <label className="block text-sm font-bold" htmlFor="profile-photo">
                Upload or replace photo
              </label>
              <input
                id="profile-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:bg-secondary file:px-3 file:py-2 file:font-bold file:text-secondary-foreground"
                aria-describedby="photo-help"
                onChange={async (e) => {
                  const file = e.currentTarget.files?.[0];
                  e.currentTarget.value = "";
                  if (!file) return;
                  setPreparingPhoto(true);
                  try {
                    setPhoto(await prepareProfilePhoto(file));
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : "Could not prepare your photo",
                    );
                  } finally {
                    setPreparingPhoto(false);
                  }
                }}
              />
              <p id="photo-help" className="text-sm text-muted-foreground">
                JPG, PNG, or WebP, up to 5 MB. Photos are cropped to a square. Save your profile to
                apply changes.
              </p>
              {preparingPhoto && <p role="status">Preparing photo...</p>}
              {(photo || isProfilePhoto(avatar)) && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPhoto(null);
                    setAvatar(AVATARS[0]!);
                  }}
                >
                  Remove photo
                </Button>
              )}
            </div>
            <ProfilePicker
              nickname={nickname}
              setNickname={setNickname}
              avatar={photo ? "" : avatar}
              setAvatar={(value) => {
                setAvatar(value);
                setPhoto(null);
              }}
            />
            <Button className="mt-4" disabled={busy || preparingPhoto || !nickname.trim()}>
              {busy ? "Saving..." : "Save profile"}
            </Button>
          </fieldset>
        </form>
      </section>
      <section className="py-6">
        <h2 className="text-2xl font-bold">Restaurant rewards</h2>
        <p className="mt-2 text-muted-foreground">
          Search Google Maps and confirm the restaurant where you have a rewards account. Your
          rewards badge will match that restaurant name at other locations too.
        </p>
        <form
          className="mt-4 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const query = rewardQuery.trim();
            if (query.length < 2 || searchingRewards) return;
            setSearchingRewards(true);
            setRewardSearchComplete(false);
            setSelectedReward(null);
            try {
              setRewardResults(await findRewardPlaces({ data: { query } }));
              setRewardSearchComplete(true);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Google Maps search failed");
            } finally {
              setSearchingRewards(false);
            }
          }}
        >
          <label className="sr-only" htmlFor="reward-restaurant">
            Search Google Maps for a restaurant
          </label>
          <input
            id="reward-restaurant"
            className="mt-0 min-w-0 flex-1 rounded-lg border bg-card px-4 py-3"
            value={rewardQuery}
            onChange={(e) => {
              setRewardQuery(e.target.value);
              setRewardResults([]);
              setRewardSearchComplete(false);
              setSelectedReward(null);
            }}
            maxLength={100}
            placeholder="Search restaurant or chain"
            disabled={busy || searchingRewards}
          />
          <Button
            type="submit"
            variant="outline"
            disabled={busy || searchingRewards || rewardQuery.trim().length < 2}
          >
            <Search className="mr-2 h-4 w-4" />
            {searchingRewards ? "Searching…" : "Search Maps"}
          </Button>
        </form>
        {rewardResults.length > 0 && !selectedReward && (
          <div className="mt-4 rounded-xl border p-4">
            <p className="mb-3 text-sm font-bold">Choose the right Google Maps listing</p>
            <ul className="divide-y">
              {rewardResults.map((place) => {
                const alreadyLinked = rewardRestaurants.some(
                  (reward) =>
                    reward.placeId === place.placeId ||
                    normalizeRestaurantName(reward.brandName) ===
                      normalizeRestaurantName(place.name),
                );
                return (
                  <li key={place.placeId} className="py-3 first:pt-0 last:pb-0">
                    <button
                      type="button"
                      className="w-full rounded-lg p-2 text-left hover:bg-muted disabled:opacity-60"
                      disabled={busy || alreadyLinked}
                      onClick={() => setSelectedReward(place)}
                    >
                      <span className="block font-bold">
                        {place.name}
                        {alreadyLinked && <span className="ml-2 text-xs">Already linked</span>}
                      </span>
                      <span className="mt-1 flex items-start gap-1 text-sm text-muted-foreground">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                        {place.address ?? "Address not listed"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Results provided by{" "}
              <span translate="no" className="whitespace-nowrap">
                Google Maps
              </span>
              .
            </p>
          </div>
        )}
        {rewardSearchComplete && rewardResults.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            No matching Google Maps listings found. Try a different search or include a city.
          </p>
        )}
        {selectedReward && (
          <div className="mt-4 rounded-xl border bg-secondary/40 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/15 p-2 text-brand">
                <Gift className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold">Confirm this restaurant</h3>
                <p className="mt-2 text-lg font-semibold">{selectedReward.name}</p>
                <p className="mt-1 flex items-start gap-1 text-sm text-muted-foreground">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  {selectedReward.address ?? "Address not listed"}
                </p>
                <a
                  className="mt-2 inline-flex items-center gap-1 text-sm font-semibold underline"
                  href={googleMapsPlaceUrl(selectedReward.placeId, selectedReward.name)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on Google Maps <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <p className="mt-3 text-sm">
                  This Google Maps listing confirms the restaurant. Place IDs are location-specific,
                  so its name from Google Maps will be used to match other locations.
                </p>
                <p className="mt-3 text-sm font-bold">
                  Saved name: <span className="font-semibold">{selectedReward.name}</span>
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={
                  busy ||
                  (rewardRestaurants.length >= 50 &&
                    !rewardRestaurants.some(
                      (reward) =>
                        reward.placeId === selectedReward.placeId ||
                        normalizeRestaurantName(reward.brandName) ===
                          normalizeRestaurantName(selectedReward.name),
                    ))
                }
                onClick={() =>
                  void act(async () => {
                    const linkedReward = {
                      placeId: selectedReward.placeId,
                      brandName: selectedReward.name,
                    };
                    const next = [
                      ...rewardRestaurants.filter(
                        (reward) =>
                          reward.placeId !== selectedReward.placeId &&
                          normalizeRestaurantName(reward.brandName) !==
                            normalizeRestaurantName(selectedReward.name),
                      ),
                      linkedReward,
                    ];
                    const saved = await saveRewards({ data: { restaurants: next } });
                    setRewardRestaurants(saved.restaurants);
                    setSelectedReward(null);
                    setRewardResults([]);
                    await queryClient.invalidateQueries({
                      queryKey: ["account-reward-restaurants"],
                    });
                    await refresh();
                    toast.success("Google Maps restaurant linked to your rewards");
                  })
                }
              >
                Confirm and save
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setSelectedReward(null)}
              >
                Back to results
              </Button>
            </div>
          </div>
        )}
        {rewardRestaurants.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {rewardRestaurants.map((reward, index) => (
              <li key={`${reward.placeId ?? "legacy"}:${reward.brandName}:${index}`}>
                <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm font-medium">
                  <Gift
                    className={`h-4 w-4 ${reward.placeId ? "text-brand" : "text-muted-foreground"}`}
                    aria-hidden="true"
                  />
                  <span>
                    {reward.brandName}
                    {!reward.placeId && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        Needs Maps confirmation
                      </span>
                    )}
                  </span>
                  {reward.placeId && (
                    <a
                      href={googleMapsPlaceUrl(reward.placeId, reward.brandName)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${reward.brandName} on Google Maps`}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove ${reward.brandName} rewards link`}
                    className="font-bold text-muted-foreground hover:text-foreground"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        const next = rewardRestaurants.filter(
                          (_, itemIndex) => itemIndex !== index,
                        );
                        const saved = await saveRewards({ data: { restaurants: next } });
                        setRewardRestaurants(saved.restaurants);
                        await queryClient.invalidateQueries({
                          queryKey: ["account-reward-restaurants"],
                        });
                        await refresh();
                        toast.success("Restaurant rewards link removed");
                      })
                    }
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No restaurant rewards linked yet.</p>
        )}
      </section>
      <section className="py-6">
        <h2 className="text-2xl font-bold">Sign-in details</h2>
        <p className="mt-3 break-words">{user.email}</p>
        <p className="text-sm text-muted-foreground">
          Connected:{" "}
          {providers
            .map((p) =>
              p === "azure"
                ? "Microsoft"
                : p === "email"
                  ? "Email and password"
                  : p.charAt(0).toUpperCase() + p.slice(1),
            )
            .join(", ")}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          To use a different email, create a new account.
        </p>
      </section>
      <section className="py-6">
        <h2 className="text-2xl font-bold">Password</h2>
        {hasPassword ? (
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                if (password !== confirm) throw new Error("Passwords do not match");
                const { error } = await supabase.auth.updateUser({
                  password,
                  current_password: currentPassword,
                });
                if (error) throw error;
                setPassword("");
                setCurrentPassword("");
                setConfirm("");
                toast.success("Password updated");
              });
            }}
          >
            <label className="block font-bold">
              Current password
              <input
                className={input}
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </label>
            <label className="block font-bold">
              New password
              <input
                className={input}
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="block font-bold">
              Confirm new password
              <input
                className={input}
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            <Button variant="outline" disabled={busy}>
              Update password
            </Button>
          </form>
        ) : (
          <p className="mt-3 text-muted-foreground">
            Your password is managed by your Google or Microsoft sign-in provider.
          </p>
        )}
      </section>
      <section className="space-y-4 py-6">
        <Button variant="outline" disabled={busy} onClick={() => void act(() => leave())}>
          Sign out
        </Button>
        <div>
          <h2 className="text-xl font-bold text-destructive">Delete account</h2>
          <p className="my-3 text-sm text-muted-foreground">
            Permanently remove your account, preferences, and social connections. Your group
            participation will be anonymized; votes and results are preserved.
          </p>
          <Dialog
            open={open}
            onOpenChange={(value) => {
              if (!busy) {
                setOpen(value);
                setDeletion("");
              }
            }}
          >
            <DialogTrigger asChild>
              <Button variant="destructive">Delete account</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Permanently delete your account?</DialogTitle>
                <DialogDescription>
                  This cannot be undone. Your room passes will stop working. Group votes and results
                  will remain anonymous.
                </DialogDescription>
              </DialogHeader>
              <label className="font-bold">
                Type DELETE to confirm
                <input
                  className={input}
                  value={deletion}
                  disabled={busy}
                  onChange={(e) => setDeletion(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy || deletion !== "DELETE"}
                  onClick={() =>
                    void act(async () => {
                      await remove({ data: { confirmation: "DELETE" } });
                      await leave(true);
                      toast.success("Account deleted");
                    })
                  }
                >
                  {busy ? "Deleting…" : "Delete permanently"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </section>
    </div>
  );
}
