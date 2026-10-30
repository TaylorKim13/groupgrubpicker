import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const AccountContext = createContext<User | null>(null);
export const useAccount = () => useContext(AccountContext);
export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED", "PASSWORD_RECOVERY"].includes(event)) return;
      if (event === "PASSWORD_RECOVERY") sessionStorage.setItem("grub-recovery", "yes");
      if (event === "SIGNED_OUT") sessionStorage.removeItem("grub-recovery");
      setUser(session?.user ?? null);
      void router.invalidate();
      if (session) void queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);
  return <AccountContext.Provider value={user}>{children}</AccountContext.Provider>;
}
