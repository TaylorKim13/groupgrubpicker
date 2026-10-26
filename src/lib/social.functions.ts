import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { authMember, db } from "./room.server";

const Auth = z.object({ code: z.string().min(6).max(6), memberId: z.string().uuid(), token: z.string().min(10) });

async function areFriends(a: string, b: string) {
  const { data } = await db()
    .from("friendships")
    .select("id")
    .eq("status", "accepted")
    .or(`and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`)
    .maybeSingle();
  return !!data;
}

/** Send (or auto-accept a crossing) friend request between two accounts. */
async function requestFriend(me: string, other: string) {
  if (me === other) throw new Error("That's you!");
  const { data: existing } = await db()
    .from("friendships")
    .select("*")
    .or(`and(requester_id.eq.${me},addressee_id.eq.${other}),and(requester_id.eq.${other},addressee_id.eq.${me})`)
    .maybeSingle();
  if (existing) {
    if (existing.status === "accepted") return { status: "already" as const };
    if (existing.requester_id === me) return { status: "pending" as const };
    await db().from("friendships").update({ status: "accepted" }).eq("id", existing.id);
    return { status: "accepted" as const };
  }
  const { error } = await db().from("friendships").insert({ requester_id: me, addressee_id: other });
  if (error) throw new Error("Could not send friend request");
  return { status: "sent" as const };
}

export const getSocial = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const me = context.userId;
    const { data: profile } = await db().from("profiles").select("friend_code").eq("id", me).single();
    const { data: fs } = await db()
      .from("friendships")
      .select("id, status, requester_id, addressee_id, created_at")
      .or(`requester_id.eq.${me},addressee_id.eq.${me}`);
    const { data: myCrewRows } = await db().from("crew_members").select("crew_id, status").eq("user_id", me);
    const crewIds = (myCrewRows ?? []).map((r: any) => r.crew_id);
    const [{ data: crews }, { data: crewMembers }] = crewIds.length
      ? await Promise.all([
          db().from("crews").select("id, name, owner_id").in("id", crewIds),
          db().from("crew_members").select("crew_id, user_id, status").in("crew_id", crewIds),
        ])
      : [{ data: [] }, { data: [] }];
    const { data: invites } = await db()
      .from("table_invites")
      .select("id, from_user, created_at, rooms(code, status)")
      .eq("to_user", me)
      .order("created_at", { ascending: false });

    const ids = new Set<string>();
    (fs ?? []).forEach((f: any) => ids.add(f.requester_id === me ? f.addressee_id : f.requester_id));
    (crewMembers ?? []).forEach((m: any) => ids.add(m.user_id));
    (crews ?? []).forEach((c: any) => ids.add(c.owner_id));
    (invites ?? []).forEach((i: any) => ids.add(i.from_user));
    const { data: people } = ids.size
      ? await db().from("profiles").select("id, display_name, avatar").in("id", [...ids])
      : { data: [] };
    const person = (id: string) => {
      const p = (people ?? []).find((x: any) => x.id === id);
      return { id, name: (p?.display_name as string) || "Friend", avatar: (p?.avatar as string) ?? "🍕" };
    };
    const statusOf = new Map((myCrewRows ?? []).map((r: any) => [r.crew_id, r.status]));
    return {
      friendCode: profile?.friend_code as string,
      friends: (fs ?? []).filter((f: any) => f.status === "accepted").map((f: any) => ({ friendshipId: f.id as string, ...person(f.requester_id === me ? f.addressee_id : f.requester_id) })),
      incoming: (fs ?? []).filter((f: any) => f.status === "pending" && f.addressee_id === me).map((f: any) => ({ friendshipId: f.id as string, ...person(f.requester_id) })),
      outgoing: (fs ?? []).filter((f: any) => f.status === "pending" && f.requester_id === me).map((f: any) => ({ friendshipId: f.id as string, ...person(f.addressee_id) })),
      crews: (crews ?? []).map((c: any) => ({
        id: c.id as string,
        name: c.name as string,
        isOwner: c.owner_id === me,
        myStatus: statusOf.get(c.id) as "invited" | "member",
        members: (crewMembers ?? []).filter((m: any) => m.crew_id === c.id).map((m: any) => ({ ...person(m.user_id), status: m.status as string })),
      })),
      tableInvites: (invites ?? [])
        .filter((i: any) => i.rooms && i.rooms.status !== "closed")
        .map((i: any) => ({ id: i.id as string, code: i.rooms.code as string, from: person(i.from_user) })),
    };
  });

export const sendFriendRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ friendCode: z.string().trim().min(4).max(12) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: other } = await db().from("profiles").select("id").eq("friend_code", data.friendCode.toUpperCase()).maybeSingle();
    if (!other) throw new Error("No one has that friend code");
    return requestFriend(context.userId, other.id);
  });

export const respondFriendRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ friendshipId: z.string().uuid(), accept: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: f } = await db().from("friendships").select("*").eq("id", data.friendshipId).maybeSingle();
    if (!f || f.addressee_id !== context.userId || f.status !== "pending") throw new Error("Request not found");
    if (data.accept) await db().from("friendships").update({ status: "accepted" }).eq("id", f.id);
    else await db().from("friendships").delete().eq("id", f.id);
    return { ok: true };
  });

export const removeFriend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ friendshipId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: f } = await db().from("friendships").select("*").eq("id", data.friendshipId).maybeSingle();
    if (!f || (f.requester_id !== context.userId && f.addressee_id !== context.userId)) throw new Error("Not found");
    await db().from("friendships").delete().eq("id", f.id);
    return { ok: true };
  });

/** Link the caller's seat in a room to their account (idempotent). */
async function linkSeat(a: z.infer<typeof Auth>, userId: string) {
  const r = await authMember(a.code, a.memberId, a.token);
  if (r.member.user_id && r.member.user_id !== userId) throw new Error("This seat belongs to another account");
  if (!r.member.user_id) await db().from("members").update({ user_id: userId }).eq("id", r.member.id);
  return r;
}

export const addFriendFromRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Auth.extend({ targetMemberId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { room } = await linkSeat(data, context.userId);
    const { data: target } = await db().from("members").select("user_id").eq("id", data.targetMemberId).eq("room_id", room.id).maybeSingle();
    if (!target?.user_id) throw new Error("They're a guest — ask them to sign in first");
    return requestFriend(context.userId, target.user_id);
  });

export const inviteFriendsToTable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Auth.extend({ userIds: z.array(z.string().uuid()).min(1).max(30) }).parse(d))
  .handler(async ({ data, context }) => {
    const { room } = await linkSeat(data, context.userId);
    if (room.status === "closed") throw new Error("This table is already decided");
    let sent = 0;
    for (const id of data.userIds) {
      if (!(await areFriends(context.userId, id))) continue;
      const { error } = await db().from("table_invites").upsert({ room_id: room.id, from_user: context.userId, to_user: id }, { onConflict: "room_id,to_user" });
      if (!error) sent++;
    }
    return { sent };
  });

export const dismissTableInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await db().from("table_invites").delete().eq("id", data.id).eq("to_user", context.userId);
    return { ok: true };
  });

export const createCrew = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ name: z.string().trim().min(1).max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: crew, error } = await db().from("crews").insert({ name: data.name, owner_id: context.userId }).select("id").single();
    if (error) throw new Error("Could not create group");
    await db().from("crew_members").insert({ crew_id: crew.id, user_id: context.userId, status: "member" });
    return { id: crew.id as string };
  });

export const inviteToCrew = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ crewId: z.string().uuid(), userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: mine } = await db().from("crew_members").select("status").eq("crew_id", data.crewId).eq("user_id", context.userId).maybeSingle();
    if (mine?.status !== "member") throw new Error("Join this group first");
    if (!(await areFriends(context.userId, data.userId))) throw new Error("You can only invite friends");
    const { error } = await db().from("crew_members").insert({ crew_id: data.crewId, user_id: data.userId, status: "invited" });
    if (error) throw new Error("They're already in or invited");
    return { ok: true };
  });

export const respondCrewInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ crewId: z.string().uuid(), accept: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const q = db().from("crew_members");
    if (data.accept) await q.update({ status: "member" }).eq("crew_id", data.crewId).eq("user_id", context.userId).eq("status", "invited");
    else await q.delete().eq("crew_id", data.crewId).eq("user_id", context.userId);
    return { ok: true };
  });

export const leaveCrew = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ crewId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: crew } = await db().from("crews").select("owner_id").eq("id", data.crewId).maybeSingle();
    if (crew?.owner_id === context.userId) await db().from("crews").delete().eq("id", data.crewId);
    else await db().from("crew_members").delete().eq("crew_id", data.crewId).eq("user_id", context.userId);
    return { ok: true };
  });

export const linkSeatToAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Auth.parse(d))
  .handler(async ({ data, context }) => {
    await linkSeat(data, context.userId);
    return { ok: true };
  });

export type Person = { id: string; name: string; avatar: string };
export type Social = {
  friendCode: string;
  friends: (Person & { friendshipId: string })[];
  incoming: (Person & { friendshipId: string })[];
  outgoing: (Person & { friendshipId: string })[];
  crews: { id: string; name: string; isOwner: boolean; myStatus: "invited" | "member"; members: (Person & { status: string })[] }[];
  tableInvites: { id: string; code: string; from: Person }[];
};
