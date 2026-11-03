import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Auth-server validation also rejects a deleted user whose JWT has not expired.
export const optionalAccountAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const header = getRequest().headers.get("authorization");
    const guestContext = { accountUserId: null as string | null };
    if (header === null || !header.startsWith("Bearer ")) {
      return next({ context: guestContext });
    }
    const { data, error } = await supabaseAdmin.auth.getUser(header.slice(7));
    // Account linking is optional for room creation. If a saved browser token
    // has expired, continue as a guest instead of blocking table creation.
    if (error || !data.user) return next({ context: guestContext });
    return next({ context: { accountUserId: data.user.id as string | null } });
  },
);
