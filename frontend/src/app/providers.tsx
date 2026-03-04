"use client";

import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "../utils/wagmi";
import { useEffect } from "react";

const queryClient = new QueryClient();

function TickProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Force the app to tick every second from the moment it loads
    const id = setInterval(() => {
      // This empty interval keeps React's event loop active
      // so useCountdown always has a fresh Date.now()
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <TickProvider>
          {children}
        </TickProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
