import { useState } from "react";
import { isProfilePhoto } from "@/lib/profile-avatar";

export function ProfileAvatar({
  avatar,
  name,
  className = "h-8 w-8",
  preview = false,
}: {
  avatar: string;
  name: string;
  className?: string;
  preview?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const photo = isProfilePhoto(avatar) || (preview && avatar.startsWith("data:image/jpeg;base64,"));
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full align-middle ${className}`}
    >
      {photo && failed !== avatar ? (
        <img
          src={avatar}
          alt={`${name}'s profile photo`}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setFailed(avatar)}
        />
      ) : (
        <span role="img" aria-label={`${name}'s avatar`}>
          {photo ? "🍕" : avatar}
        </span>
      )}
    </span>
  );
}
