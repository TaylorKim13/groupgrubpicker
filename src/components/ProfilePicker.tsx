import { ProfileAvatar } from "./ProfileAvatar";
import { isProfilePhoto } from "@/lib/profile-avatar";
import { AVATARS } from "@/lib/restaurants";
import { Button } from "@/components/ui/button";

export function ProfilePicker({
  nickname,
  setNickname,
  avatar,
  setAvatar,
  autoFocus = false,
}: {
  nickname: string;
  setNickname: (s: string) => void;
  avatar: string;
  setAvatar: (s: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="space-y-3">
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
        className="w-full rounded-lg border-2 bg-card px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-ring"
      />
      {isProfilePhoto(avatar) && (
        <div className="flex items-center gap-2">
          <ProfileAvatar avatar={avatar} name={nickname || "Your"} className="h-11 w-11 border-2" />
          <span className="text-sm text-muted-foreground">Using your profile photo</span>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {AVATARS.map((a) => (
          <Button
            variant="ghost"
            key={a}
            type="button"
            onClick={() => setAvatar(a)}
            aria-label={`Avatar ${a}`}
            className={`grid h-11 w-11 place-items-center rounded-full border-2 text-xl transition ${
              avatar === a ? "bg-secondary scale-110 chunky" : "bg-card"
            }`}
          >
            {a}
          </Button>
        ))}
      </div>
    </div>
  );
}
