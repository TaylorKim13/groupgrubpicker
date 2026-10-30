import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { lovable } from '@/integrations/lovable';
import { supabase } from '@/integrations/supabase/client';
import { Eye, EyeOff } from 'lucide-react';

export function SignInPanel() {
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [sent, setSent] = useState(false);

  async function social(provider: "google" | "microsoft") {
    setBusy(true);
    try {
      const result = import.meta.env['VITE_AUTH_MODE'] === 'supabase'
        ? await supabase.auth.signInWithOAuth({
            provider: provider === 'microsoft' ? 'azure' : 'google',
            options: { redirectTo: window.location.origin + '/account', scopes: 'email' },
          })
        : await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin + '/account' });
      if (result.error) throw result.error;
    } catch {
      toast.error("Could not sign in. Please try again.");
    } finally {
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
    },
  });

  if (error) throw error;

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

    } catch (err: any) {
      toast.error(err?.message ?? "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <p className="mt-6 rounded-lg border-2 bg-card p-4 font-medium">
        Check your email to confirm your account, then come back and sign in.
      </p>
    );

  return (
    <div className="mt-6 space-y-3">
      <Button className="w-full chunky" disabled={busy} onClick={() => social("google")}>
        Continue with Google
      </Button>
      <Button
        variant="secondary"
        className="w-full chunky"
        disabled={busy}
        onClick={() => social("microsoft")}
      >
        Continue with Microsoft
      </Button>
      <div className="flex items-center gap-3 py-2 text-xs font-bold uppercase text-muted-foreground">
        <span className="h-0.5 flex-1 bg-border" />
        or email
        <span className="h-0.5 flex-1 bg-border" />
      </div>
      <form onSubmit={withEmail} className="space-y-3">
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
            minLength={6}
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
            {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        </div>

        <Button type="submit" variant="outline" className="w-full" disabled={busy}>
          {mode === "in" ? "Sign in with email" : "Create account"}
        </Button>
      </form>
      {mode === "in" && (
        <Button
          variant="link"
          disabled={busy || !email.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + "/reset-password",
              });
              if (error) throw error;
              toast.success("If an account exists, a password reset link has been sent.");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not send reset email");
            } finally {
              setBusy(false);
            }
          }}
        >
          Forgot password? Enter your email above
        </Button>
      )}
      <button
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
