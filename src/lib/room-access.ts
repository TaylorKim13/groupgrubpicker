import { z } from "zod";
import { AvatarSchema } from "./profile-avatar";

export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const RoomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{6}$/, "Enter a 6-character room code");
export const RoomProfileSchema = z.object({
  nickname: z.string().trim().min(1, "Pick a nickname first").max(24),
  avatar: AvatarSchema,
});
export const normalizeRoomCode = (code: string) => code.trim().toUpperCase();
export const roomJoinUrl = (origin: string, code: string) =>
  new URL(`/room/${RoomCodeSchema.parse(code)}`, origin).href;
