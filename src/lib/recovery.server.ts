import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { RecoverySchema, RECOVERY_MESSAGE } from "./recovery";

// The resolver and email address stay on the server. Unknown and throttled
// identifiers receive the same response as successful requests.
export async function sendRecovery(
  client: SupabaseClient<Database>,
  input: unknown,
  redirectTo: string,
  requester: string,
) {
  const data = RecoverySchema.parse(input);
  const { data: email, error } = await client.rpc("resolve_grub_recovery", {
    p_kind: data.kind,
    p_identifier: data.identifier,
    p_requester: requester,
  });
  if (error) {
    console.error("Recovery lookup unavailable", error.code);
    throw new Error("Recovery is temporarily unavailable. Please try again later.");
  }
  if (email) {
    const { error: deliveryError } = await client.auth.resetPasswordForEmail(email, { redirectTo });
    // Do not return provider errors that could reveal an address or its existence.
    // Operators can diagnose SMTP configuration using the error code only.
    if (deliveryError)
      console.error("Recovery email delivery failed", deliveryError.code ?? deliveryError.status);
  }
  return { message: RECOVERY_MESSAGE };
}
