import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAccount } from "@/lib/account.functions";
import { DistanceContext } from "@/lib/distance-context";
import { useAccount } from "./AccountProvider";

export function DistanceProvider({ children }: { children: ReactNode }) {
  const user = useAccount();
  const fetch = useServerFn(getAccount);
  const account = useQuery({
    queryKey: ["account", user?.id],
    queryFn: () => fetch(),
    enabled: !!user,
  });
  return (
    <DistanceContext.Provider value={user ? (account.data?.distanceUnit ?? "mi") : "mi"}>
      {children}
    </DistanceContext.Provider>
  );
}
