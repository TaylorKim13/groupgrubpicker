import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { requestRecovery } from "@/lib/recovery.functions";
import { Button } from "./ui/button";

export function RecoveryPanel({
  onBack,
  initialEmail = "",
}: {
  onBack: () => void;
  initialEmail?: string;
}) {
  const [kind, setKind] = useState<"email" | "username">("email");
  const [identifier, setIdentifier] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const send = useServerFn(requestRecovery);
  return (
    <section className="mt-6 space-y-4" aria-labelledby="recovery-title">
      <h2 id="recovery-title" className="text-2xl font-bold">
        Forgot your password?
      </h2>
      <p className="text-sm text-muted-foreground">
        {kind === "email"
          ? "Enter your account email and we’ll send a password reset link."
          : "Enter your username. We’ll send a reset link to the email saved on that account."}
      </p>
      {message ? (
        <p role="status" className="rounded-lg border-2 bg-card p-4">
          {message}
        </p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            try {
              const result = await send({ data: { kind, identifier } });
              setMessage(result.message);
            } catch {
              setError("Could not request a reset link. Please try again later.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block font-bold">
            {kind === "email" ? "Account email" : "Username"}
            <input
              className="mt-2 w-full rounded-lg border-2 bg-card px-4 py-3"
              type={kind === "email" ? "email" : "text"}
              required
              disabled={busy}
              autoComplete={kind === "email" ? "email" : "username"}
              autoCapitalize="none"
              spellCheck={false}
              minLength={kind === "username" ? 3 : undefined}
              maxLength={kind === "username" ? 24 : 254}
              pattern={kind === "username" ? "[A-Za-z0-9_]{3,24}" : undefined}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <Button className="w-full" disabled={busy}>
            {busy ? "Requesting…" : "Send recovery email"}
          </Button>
        </form>
      )}
      <Button
        type="button"
        variant="link"
        disabled={busy}
        onClick={() => {
          setKind(kind === "email" ? "username" : "email");
          setIdentifier("");
          setMessage("");
          setError("");
        }}
      >
        {kind === "email" ? "Forgot your email? Use your username" : "Use your email instead"}
      </Button>
      <p className="text-sm text-muted-foreground">
        You’ll need access to your saved email inbox to recover your account.
      </p>
      <Button type="button" variant="outline" disabled={busy} onClick={onBack}>
        Back to sign-in
      </Button>
    </section>
  );
}
