import { createServerFn } from "@tanstack/react-start";
import { RecoverySchema } from "./recovery";

export const requestRecovery = createServerFn({ method: "POST" })
  .inputValidator((input) => RecoverySchema.parse(input))
  .handler(async ({ data }) => {
    const [{ getRequest }, { supabaseAdmin }, { sendRecovery }, { recoveryRedirect }] =
      await Promise.all([
        import("@tanstack/react-start/server"),
        import("@/integrations/supabase/client.server"),
        import("./recovery.server"),
        import("./recovery"),
      ]);
    const request = getRequest();
    // Configure PUBLIC_SITE_URL on hosts whose internal request URL differs
    // from their public origin. Never accept a redirect supplied by the form.
    const redirectTo = recoveryRedirect(
      request,
      process.env["PUBLIC_SITE_URL"] || process.env["RENDER_EXTERNAL_URL"],
    );
    const requester =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    return sendRecovery(supabaseAdmin, data, redirectTo, requester.slice(0, 128));
  });
