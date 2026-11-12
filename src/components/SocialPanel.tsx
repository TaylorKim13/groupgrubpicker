import { ProfileAvatar } from "./ProfileAvatar";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Social } from "@/lib/social.functions";
import {
  createCrew,
  dismissTableInvite,
  getSocial,
  inviteToCrew,
  leaveCrew,
  removeFriend,
  respondCrewInvite,
  respondFriendRequest,
  sendFriendRequest,
} from "@/lib/social.functions";

export function useSocial(userId: string | undefined) {
  const fn = useServerFn(getSocial);
  return useQuery({
    queryKey: ["social", userId],
    queryFn: () => fn() as Promise<Social>,
    enabled: !!userId,
    refetchInterval: 15000,
  });
}

export function SocialPanel({ userId }: { userId: string }) {
  const social = useSocial(userId);
  const send = useServerFn(sendFriendRequest);
  const respond = useServerFn(respondFriendRequest);
  const remove = useServerFn(removeFriend);
  const newCrew = useServerFn(createCrew);
  const invite = useServerFn(inviteToCrew);
  const respondCrew = useServerFn(respondCrewInvite);
  const leave = useServerFn(leaveCrew);
  const dismiss = useServerFn(dismissTableInvite);
  const [code, setCode] = useState("");
  const [crewName, setCrewName] = useState("");
  const act = async (p: Promise<unknown>, ok?: string) => {
    try {
      await p;
      if (ok) toast.success(ok);
      await social.refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Something went wrong");
    }
  };
  if (social.isPending) return <p className="py-6">Loading friends…</p>;
  if (social.error || !social.data)
    return (
      <p role="alert" className="py-6">
        Could not load friends.{" "}
        <Button variant="link" onClick={() => social.refetch()}>
          Try again
        </Button>
      </p>
    );
  const s = social.data;

  return (
    <>
      {s.tableInvites.length > 0 && (
        <section className="border-b py-6">
          <h2 className="text-2xl font-bold">Table invites</h2>
          <ul className="mt-3 space-y-2">
            {s.tableInvites.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
              >
                <span>
                  <ProfileAvatar avatar={i.from.avatar} name={i.from.name} /> <b>{i.from.name}</b>{" "}
                  invited you to table {i.code}
                </span>
                <span className="flex gap-2">
                  <Button asChild size="sm">
                    <Link to="/room/$code" params={{ code: i.code }}>
                      Join
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => act(dismiss({ data: { id: i.id } }))}
                  >
                    Dismiss
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="border-b py-6">
        <h2 className="text-2xl font-bold">Friends</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your friend code:{" "}
          <span className="font-display text-lg tracking-widest text-foreground">
            {s.friendCode}
          </span>{" "}
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(s.friendCode);
              toast.success("Copied");
            }}
          >
            Copy
          </Button>
        </p>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act(
              send({ data: { friendCode: code } }).then((r) => {
                setCode("");
                toast.success(
                  r.status === "accepted"
                    ? "You are now friends"
                    : r.status === "already"
                      ? "Already friends"
                      : "Request sent",
                );
              }),
            );
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 12))}
            placeholder="Friend's code"
            aria-label="Friend code"
            className="flex-1 rounded-lg border bg-card px-3 py-2 font-display uppercase"
          />
          <Button type="submit" disabled={code.length < 4}>
            Add friend
          </Button>
        </form>
        {s.incoming.length > 0 && (
          <ul className="mt-4 space-y-2">
            {s.incoming.map((f) => (
              <li
                key={f.friendshipId}
                className="flex items-center justify-between rounded-lg border bg-card p-3"
              >
                <span>
                  <ProfileAvatar avatar={f.avatar} name={f.name} /> <b>{f.name}</b> wants to be
                  friends
                </span>
                <span className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      act(
                        respond({ data: { friendshipId: f.friendshipId, accept: true } }),
                        "Friend added",
                      )
                    }
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      act(respond({ data: { friendshipId: f.friendshipId, accept: false } }))
                    }
                  >
                    Decline
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <ul className="mt-4 divide-y">
          {s.friends.map((f) => (
            <li key={f.friendshipId} className="flex items-center justify-between py-2">
              <span>
                <ProfileAvatar avatar={f.avatar} name={f.name} /> {f.name}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => act(remove({ data: { friendshipId: f.friendshipId } }))}
              >
                Remove
              </Button>
            </li>
          ))}
          {s.outgoing.map((f) => (
            <li
              key={f.friendshipId}
              className="flex items-center justify-between py-2 text-muted-foreground"
            >
              <span>
                <ProfileAvatar avatar={f.avatar} name={f.name} /> {f.name} · request sent
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => act(remove({ data: { friendshipId: f.friendshipId } }))}
              >
                Cancel
              </Button>
            </li>
          ))}
          {!s.friends.length && !s.outgoing.length && (
            <li className="py-2 text-sm text-muted-foreground">
              No friends yet. Share your code, or tap "Add friend" next to someone at a table.
            </li>
          )}
        </ul>
      </section>

      <section className="border-b py-6">
        <h2 className="text-2xl font-bold">Your groups</h2>
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            act(
              newCrew({ data: { name: crewName } }).then(() => setCrewName("")),
              "Group created",
            );
          }}
        >
          <input
            value={crewName}
            onChange={(e) => setCrewName(e.target.value)}
            maxLength={40}
            placeholder="e.g. Work lunch crew"
            aria-label="Group name"
            className="h-10 min-w-0 flex-1 rounded-lg border bg-card px-3 py-2 text-sm"
          />
          <Button type="submit" disabled={!crewName.trim()}>
            Create group
          </Button>
        </form>
        <ul className="mt-4 space-y-3">
          {s.crews.map((c) => (
            <li key={c.id} className="overflow-hidden rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="break-words text-lg font-semibold">{c.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.members.filter((m) => m.status === "member").length} {c.members.filter((m) => m.status === "member").length === 1 ? "member" : "members"}
                    {c.members.some((m) => m.status === "invited") && ` / ${c.members.filter((m) => m.status === "invited").length} pending`}
                  </p>
                </div>
                {c.myStatus === "invited" ? (
                  <span className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        act(respondCrew({ data: { crewId: c.id, accept: true } }), "Joined group")
                      }
                    >
                      Join
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => act(respondCrew({ data: { crewId: c.id, accept: false } }))}
                    >
                      Decline
                    </Button>
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => act(leave({ data: { crewId: c.id } }))}
                  >
                    {c.isOwner ? "Delete" : "Leave"}
                  </Button>
                )}
              </div>
              <ul className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-2" aria-label={`Members of ${c.name}`}>
                {c.members.map((m) => (
                  <li key={m.id} className="flex min-w-0 items-center gap-3 rounded-lg border bg-muted/50 px-3 py-2.5">
                    <ProfileAvatar avatar={m.avatar} name={m.name} className="h-9 w-9 bg-background text-xl" />
                    <span className="min-w-0 flex-1 break-words text-sm font-medium">{m.name}{m.id === userId && m.name !== "You" && <span className="ml-1 font-normal text-muted-foreground">(you)</span>}</span>
                    {m.status === "invited" && <span className="shrink-0 rounded-full bg-secondary px-2 py-1 text-[10px] font-semibold text-secondary-foreground">Invited</span>}
                  </li>
                ))}
              </ul>
              {c.myStatus === "member" &&
                (() => {
                  const options = s.friends.filter((f) => !c.members.some((m) => m.id === f.id));
                  return (
                    options.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {options.map((f) => (
                          <Button
                            key={f.id}
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              act(invite({ data: { crewId: c.id, userId: f.id } }), "Invite sent")
                            }
                          >
                            + {f.name}
                          </Button>
                        ))}
                      </div>
                    )
                  );
                })()}
            </li>
          ))}
          {!s.crews.length && (
            <li className="text-sm text-muted-foreground">
              Make a group for the people you eat with often, then invite the whole group to a table
              in one tap.
            </li>
          )}
        </ul>
      </section>
    </>
  );
}
