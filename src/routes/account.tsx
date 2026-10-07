import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProfilePicker } from '@/components/ProfilePicker';
import { useAccount } from '@/components/AccountProvider';
import { lovable } from '@/integrations/lovable';
import { supabase } from '@/integrations/supabase/client';
import { getAccount, saveAccount } from '@/lib/account.functions';
import { getGroupHistory } from '@/lib/room.functions';
import { priceLabel, type RoomSettings } from '@/lib/restaurants';

export const Route = createFileRoute('/account')({
 head: () => ({ meta: [{ title: 'Your table — GROUP GRUB' }, { name: 'description', content: 'Your saved dining preferences and group history.' }, { property: 'og:title', content: 'Your table — GROUP GRUB' }, { property: 'og:description', content: 'Your saved dining preferences and group history.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
 component: AccountPage,
});
function AccountPage() {
 const user = useAccount();
 const fetchAccount = useServerFn(getAccount);
 const fetchHistory = useServerFn(getGroupHistory);
 const save = useServerFn(saveAccount);
 const qc = useQueryClient();
 const navigate = useNavigate();
 const account = useQuery({ queryKey: ['account', user?.id], queryFn: () => fetchAccount(), enabled: !!user });
 const history = useQuery({ queryKey: ['group-history', user?.id], queryFn: () => fetchHistory(), enabled: !!user });
 const [nickname, setNickname] = useState('');
 const [avatar, setAvatar] = useState('🍕');
 const [busy, setBusy] = useState(false);
 useEffect(() => { if (account.data) { setNickname(account.data.profile.display_name); setAvatar(account.data.profile.avatar); } }, [account.data]);
 const settings = account.data?.settings as RoomSettings | null;
 async function signIn() {
  setBusy(true);
  try { const result = await lovable.auth.signInWithOAuth('google', { redirect_uri: window.location.origin }); if (result.error) throw result.error; }
  catch { toast.error('Could not sign in. Please try again.'); }
  finally { setBusy(false); }
 }
 return <main className="mx-auto max-w-2xl px-5 py-8">
  <Button asChild variant="ghost"><Link to="/"><ArrowLeft /> Home</Link></Button>
  <h1 className="mt-6 text-4xl font-extrabold">Your table</h1>
  {!user ? <section className="mt-8 border-y-2 py-8"><h2 className="text-2xl font-bold">Keep your favorites for next time</h2><p className="mt-3 text-muted-foreground">Save dining preferences and revisit your group’s picks. You can always join a room as a guest.</p><Button className="mt-6 chunky" disabled={busy} onClick={signIn}>Continue with Google</Button></section> : <>
   <section className="mt-8 border-y-2 py-6"><h2 className="mb-4 text-2xl font-bold">Your nickname & avatar</h2>
    {account.isPending ? <p>Loading your profile…</p> : account.error ? <p role="alert">Could not load your profile. <Button variant="link" onClick={() => account.refetch()}>Try again</Button></p> : <><ProfilePicker {...{ nickname, setNickname, avatar, setAvatar }} /><Button className="mt-4" disabled={busy || !nickname.trim()} onClick={async () => { setBusy(true); try { await save({ data: { display_name: nickname, avatar } }); toast.success('Profile saved'); await account.refetch(); } catch { toast.error('Could not save your profile'); } finally { setBusy(false); } }}>Save profile</Button></>}
   </section>
   <section className="py-6 border-b-2"><h2 className="text-2xl font-bold">Saved preferences</h2>{settings?.center ? <p className="mt-3 text-muted-foreground">{settings.center.label} · {settings.radiusKm} km · {priceLabel(settings.priceMin)}–{priceLabel(settings.priceMax)} · {settings.maxWait} min max wait{settings.diets.length ? ` · ${settings.diets.join(', ')}` : ''}</p> : <p className="mt-3 text-muted-foreground">No preferences saved yet. Save them when setting up a room.</p>}</section>
   <section className="py-6"><h2 className="text-2xl font-bold">Past & current groups</h2>
    {history.isPending ? <p className="mt-3">Loading groups…</p> : history.error ? <p role="alert">Could not load groups. <Button variant="link" onClick={() => history.refetch()}>Try again</Button></p> : !history.data?.length ? <p className="mt-3 text-muted-foreground">Your groups will appear here after you join while signed in.</p> : <ul className="mt-4 divide-y-2">{history.data.map((r, i) => <li key={`${r.code}-${i}`} className="py-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{r.winner ?? r.label ?? r.code}</p><p className="text-sm text-muted-foreground">{r.code} · {new Date(r.joinedAt).toLocaleDateString()} · {r.status === 'closed' ? 'Finished' : r.status === 'voting' ? 'Voting' : 'Getting ready'}</p>{r.votingStartedAt && r.closedAt && <p className="text-xs text-muted-foreground">Decided in {Math.max(1, Math.round((Date.parse(r.closedAt) - Date.parse(r.votingStartedAt)) / 60000))} min</p>}</div><Button asChild variant="outline"><Link to="/room/$code" params={{ code: r.code }}>Open</Link></Button></div></li>)}</ul>}
   </section>
   <Button variant="outline" onClick={async () => { await qc.cancelQueries(); qc.clear(); await supabase.auth.signOut(); await navigate({ to: '/account', replace: true }); }}><LogOut /> Sign out</Button>
  </>}
 </main>;
}
