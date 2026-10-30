import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Auth-server validation also rejects a deleted user whose JWT has not expired.
export const optionalAccountAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const header = getRequest().headers.get("authorization");
    if (header === null) return next({ context: { accountUserId: null as string | null } });
    if (!header.startsWith("Bearer ")) throw new Error("Invalid authorization");
    const { data, error } = await supabaseAdmin.auth.getUser(header.slice(7));
    if (error || !data.user) throw new Error("Please sign in again");
    return next({ context: { accountUserId: data.user.id as string | null } });
  },
);
