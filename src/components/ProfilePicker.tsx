import { AVATARS } from "@/lib/restaurants";

export function ProfilePicker({
  nickname,
  setNickname,
  avatar,
  setAvatar,
}: {
  nickname: string;
  setNickname: (s: string) => void;
  avatar: string;
  setAvatar: (s: string) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="block text-sm font-bold uppercase tracking-wide">Your nickname</label>
      <input
        value={nickname}
        maxLength={24}
        onChange={(e) => setNickname(e.target.value)}
        placeholder="e.g. Taco Tay"
        className="w-full rounded-lg border-2 bg-card px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="flex flex-wrap gap-2">
        {AVATARS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAvatar(a)}
            aria-label={`Avatar ${a}`}
            className={`grid h-11 w-11 place-items-center rounded-full border-2 text-xl transition ${
              avatar === a ? "bg-secondary scale-110 chunky" : "bg-card"
            }`}
          >
            {a}
          </button>
        ))}
      </div>
    </div>
  );
}

