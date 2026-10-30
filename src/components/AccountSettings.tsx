import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { saveAccount, deleteAccount } from "@/lib/account.functions";
import { ProfilePicker } from "./ProfilePicker";
import { ProfileAvatar } from "./ProfileAvatar";
import { prepareProfilePhoto } from "@/lib/prepare-profile-photo";
import { isProfilePhoto } from "@/lib/profile-avatar";
import { AVATARS } from "@/lib/restaurants";
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
  refresh,
  leave,
}: {
  user: User;
  profile: { display_name: string; avatar: string };
  refresh: () => Promise<unknown>;
  leave: (deleted?: boolean) => Promise<void>;
}) {
  const [nickname, setNickname] = useState(profile.display_name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [photo, setPhoto] = useState<string | null>(null);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [deletion, setDeletion] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = useServerFn(saveAccount);
  const remove = useServerFn(deleteAccount);
  const providers = [...new Set(user.identities?.map((i) => i.provider) ?? [])];
  const hasPassword = providers.includes("email");
  const input = "mt-2 w-full rounded-lg border-2 bg-card px-4 py-3";
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
    <div className="divide-y-2">
      <section className="py-6">
        <h2 className="mb-4 text-2xl font-bold">Your profile</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              const saved = await save({
                data: { display_name: nickname, avatar, ...(photo ? { photo } : {}) },
              });
              setAvatar(saved.avatar);
              setPhoto(null);
              await refresh();
              toast.success("Profile saved");
            });
          }}
        >
          <fieldset disabled={busy || preparingPhoto}>
            <div className="mb-5 space-y-3">
              <h3 className="font-bold">Profile photo</h3>
              <ProfileAvatar
                avatar={photo ? `data:image/jpeg;base64,${photo}` : avatar}
                name={nickname || "Your"}
                preview
                className="h-24 w-24 border-2 bg-card text-4xl"
              />
              <label className="block text-sm font-bold" htmlFor="profile-photo">
                Upload or replace photo
              </label>
              <input
                id="profile-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="block w-full text-sm file:mr-3 file:rounded-lg file:border-2 file:bg-secondary file:px-3 file:py-2 file:font-bold"
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
