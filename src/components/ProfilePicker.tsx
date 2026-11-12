import { ProfileAvatar } from "./ProfileAvatar";
import { isProfilePhoto } from "@/lib/profile-avatar";
import { AVATARS } from "@/lib/restaurants";
import { Button } from "@/components/ui/button";

export function ProfilePicker({
  nickname,
  setNickname,
  avatar,
  setAvatar,
  profilePhoto,
  autoFocus = false,
}: {
  nickname: string;
  setNickname: (s: string) => void;
  avatar: string;
  setAvatar: (s: string) => void;
  profilePhoto?: string | undefined;
  autoFocus?: boolean;
}) {
  const hasProfilePhoto = !!profilePhoto && isProfilePhoto(profilePhoto);
  return (
    <div className="min-w-0 max-w-full space-y-3">
      <label htmlFor="nickname" className="block text-sm font-bold uppercase tracking-wide">
        Your nickname
      </label>
      <input
        id="nickname"
        value={nickname}
        maxLength={24}
        required
        autoFocus={autoFocus}
        autoComplete="nickname"
        onChange={(e) => setNickname(e.target.value)}
        placeholder="e.g. Taco Tay"
        className="w-full rounded-lg border bg-card px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-ring"
      />
      {isProfilePhoto(avatar) && (
        <div className="flex items-center gap-2">
          <ProfileAvatar avatar={avatar} name={nickname || "Your"} className="h-11 w-11 border" />
          <span className="text-sm text-muted-foreground">Using your profile photo</span>
        </div>
      )}
      <div
        role="group"
        aria-label="Choose your avatar"
        className="flex min-w-0 max-w-full flex-wrap gap-2 pt-3"
      >
        {profilePhoto && isProfilePhoto(profilePhoto) && (
          <Button
            variant="ghost"
            type="button"
            onClick={() => setAvatar(profilePhoto)}
            aria-label="Use your profile photo"
            title="Use your profile photo"
            aria-pressed={avatar === profilePhoto}
            className={`h-11 w-11 shrink-0 rounded-full border p-0 ${
              avatar === profilePhoto ? "bg-secondary scale-110 chunky" : "bg-card"
            }`}
          >
            <ProfileAvatar
              avatar={profilePhoto}
              name={nickname || "Your"}
              className="h-full w-full"
            />
          </Button>
        )}
        {AVATARS.filter((a) => !hasProfilePhoto || a !== "🥑").map((a) => (
          <Button
            variant="ghost"
            key={a}
            type="button"
            onClick={() => setAvatar(a)}
            aria-label={`Avatar ${a}`}
            aria-pressed={avatar === a}
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border text-xl transition ${
              avatar === a ? "bg-secondary scale-110 ring-2 ring-primary ring-offset-2 ring-offset-background border-primary" : "bg-card"
            }`}
          >
            {a}
          </Button>
        ))}
      </div>
    </div>
  );
}
