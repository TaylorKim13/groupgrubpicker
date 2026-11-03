import { createHash, randomInt } from "crypto";
import { ROOM_CODE_CHARACTERS, ROOM_CODE_LENGTH } from "./room-access";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const db = () => supabaseAdmin as any;

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function getRoomByCode(code: string) {
  const { data, error } = await db()
    .from("rooms")
    .select("*")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Room not found");
  return data;
}

/** Verify a member's private pass for this room. */
export async function authMember(code: string, memberId: string, token: string) {
  const room = await getRoomByCode(code);
  const { data: m } = await db()
    .from("members")
    .select("*")
    .eq("id", memberId)
    .eq("room_id", room.id)
    .maybeSingle();
  if (!m || m.token_hash !== hashToken(token)) throw new Error("Not a member of this room");
  return { room, member: m };
}

export function newCode() {
  return Array.from(
    { length: ROOM_CODE_LENGTH },
    () => ROOM_CODE_CHARACTERS[randomInt(ROOM_CODE_CHARACTERS.length)],
  ).join("");
}

export function newToken() {
  return crypto.randomUUID() + crypto.randomUUID();
}
