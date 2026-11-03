import { z } from "zod";

export const UsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(24)
  .regex(/^[a-z0-9_]+$/, "Use 3–24 letters, numbers, or underscores for your username.");

export const RecoverySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("email"),
    identifier: z.string().trim().toLowerCase().email().max(254),
  }),
  z.object({ kind: z.literal("username"), identifier: UsernameSchema }),
]);

export const RECOVERY_MESSAGE =
  "If an account matches, a password reset link will be sent to its saved email address. Check your inbox and spam folder. You can request another link in a minute.";

export function recoveryRedirect(request: Request, configuredOrigin?: string): string {
  const origin = new URL(configuredOrigin || request.url);
  if (
    origin.username ||
    origin.password ||
    (origin.protocol !== "https:" &&
      !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)))
  ) {
    throw new Error("Password recovery requires an HTTPS site URL.");
  }
  return new URL("/reset-password", origin.origin).href;
}
