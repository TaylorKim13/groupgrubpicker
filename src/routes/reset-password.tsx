import { PhotoBanner } from "@/components/PhotoBanner";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RecoveryPanel } from "@/components/RecoveryPanel";

export const Route = createFileRoute("/reset-password")({ component: ResetPassword });
function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let active = true;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" && active) {
        sessionStorage.removeItem("grub-recovery");
        setReady(false);
      }
      if (event === "PASSWORD_RECOVERY" && session && active) {
        sessionStorage.setItem("grub-recovery", session.user.id);
        setReady(true);
        setChecking(false);
      }
    });
    async function check() {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.slice(1));
      if (url.searchParams.has("error") || hash.has("error")) {
        setError("This reset link is invalid or expired. Request a new link from sign-in.");
        setChecking(false);
        return;
      }
      // getSession waits for the client's automatic implicit/PKCE callback handling.
      // Exchanging a PKCE code here would consume an already exchanged code twice.
      const { data: session, error: sessionError } = await supabase.auth.getSession();
      if (active) {
        setReady(
          !sessionError &&
            !!session.session &&
            sessionStorage.getItem("grub-recovery") === session.session.user.id,
        );
        setChecking(false);
      }
    }
    void check();
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return (
    <main className="mx-auto max-w-md space-y-5 px-5 py-12">
      <PhotoBanner title="Reset your password" photo="reset" />
      {checking ? (
        <p>Checking your reset link…</p>
      ) : done ? (
        <>
          <p>Password updated.</p>
          <Button asChild>
            <Link to="/account">Go to your account</Link>
          </Button>
        </>
      ) : !ready ? (
        <>
          <p role="alert">
            {error || "This reset link is invalid or expired. Request a new link from sign-in."}
          </p>
          <RecoveryPanel
            onBack={() => {
              window.location.assign("/account");
            }}
          />
        </>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            if (password !== confirm) {
              setError("Passwords do not match");
              return;
            }
            setBusy(true);
            try {
              const { error } = await supabase.auth.updateUser({ password });
              if (error) throw error;
              sessionStorage.removeItem("grub-recovery");
              setDone(true);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not update password");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block font-bold">
            New password
            <input
              className="mt-2 w-full rounded-lg border bg-card px-4 py-3"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="block font-bold">
            Confirm password
            <input
              className="mt-2 w-full rounded-lg border bg-card px-4 py-3"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <Button disabled={busy}>{busy ? "Saving…" : "Save password"}</Button>
        </form>
      )}
    </main>
  );
}
