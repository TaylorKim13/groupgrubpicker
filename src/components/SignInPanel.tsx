import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff } from "lucide-react";
import { RecoveryPanel } from "./RecoveryPanel";
import { UsernameSchema } from "@/lib/recovery";

export function SignInPanel() {
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sent, setSent] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [username, setUsername] = useState("");

  useEffect(() => {
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    if (!url.searchParams.has("error") && !hash.has("error")) return;
    toast.error("Sign-in could not be completed. Please try again or use another sign-in method.");
    for (const key of ["error", "error_code", "error_description"]) {
      url.searchParams.delete(key);
      hash.delete(key);
    }
    url.hash = hash.toString();
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);

  async function withGoogle() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + "/account",
        },
      });
      if (error) throw error;
      // Keep the controls disabled while the browser leaves for the provider.
    } catch {
      toast.error("Could not start sign-in. Please try again or sign in with email.");
      setBusy(false);
    }
  }

  async function withEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const normalizedEmail = email.trim().toLowerCase();
    try {
      if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: window.location.origin + "/account",
            data: { username: UsernameSchema.parse(username) },
          },
        });

        if (error) {
          if (error.code === "unexpected_failure") {
            throw new Error(
              "Could not create your account. Try another username, or sign in if you already have an account.",
            );
          }
          throw error;
        }

        if (data.user && data.user.identities?.length === 0) {
          toast.error("An account with this email already exists. Try signing in.");
          return;
        }

        if (data.session) {
          toast.success("Account created. You're signed in!");
        } else {
          setSent(true);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (error) throw error;
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  if (recovering) return <RecoveryPanel initialEmail={email} onBack={() => setRecovering(false)} />;

  if (sent)
    return (
      <p className="mt-6 rounded-lg border-2 bg-card p-4 font-medium">
        Check your email to confirm your account, then come back and sign in.
      </p>
    );

  return (
    <div className="mt-6 space-y-3">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={busy}
        onClick={() => void withGoogle()}
      >
        Continue with Google
      </Button>
      <p className="text-sm text-muted-foreground">
        New here? Continuing with Google creates your account automatically.
      </p>
      <p className="text-center text-sm text-muted-foreground">Or use email</p>
      <form onSubmit={withEmail} className="space-y-3">
        {mode === "up" && (
          <label className="block text-sm font-bold">
            Username
            <input
              type="text"
              required
              minLength={3}
              maxLength={24}
              pattern="[A-Za-z0-9_]{3,24}"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-2 w-full rounded-lg border-2 bg-card px-4 py-3"
            />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              Choose a unique username with 3–24 letters, numbers, or underscores. You can use it to
              recover your account.
            </span>
          </label>
        )}
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email"
          className="w-full rounded-lg border-2 bg-card px-4 py-3"
        />

        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            required
            minLength={mode === "up" ? 8 : 6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            aria-label="Password"
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            className="w-full rounded-lg border-2 bg-card px-4 py-3 pr-12"
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex items-center px-4 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? (
              <EyeOff size={18} aria-hidden="true" />
            ) : (
              <Eye size={18} aria-hidden="true" />
            )}
          </button>
        </div>

        <Button type="submit" variant="outline" className="w-full" disabled={busy}>
          {mode === "in" ? "Sign in with email" : "Create account"}
        </Button>
      </form>
      {mode === "in" && (
        <Button variant="link" disabled={busy} onClick={() => setRecovering(true)}>
          Forgot password or email?
        </Button>
      )}
      <button
        type="button"
        disabled={busy}
        className="text-sm font-bold underline"
        onClick={() => {
          setMode(mode === "in" ? "up" : "in");
          setShowPassword(false);
        }}
      >
        {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
