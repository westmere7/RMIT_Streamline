"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { useState } from "react";
import { Toaster } from "sonner";
import { AuthProviderContext } from "@/features/auth/auth-context";
import { DataProviderContext } from "@/features/data/data-context";

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Local data is cheap to re-read; keep it fresh but avoid refetch storms.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        onError: (error) => {
          console.error("[mutation] failed", error);
        },
      },
    },
  });
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <DataProviderContext>
        <AuthProviderContext>
          <TooltipPrimitive.Provider delayDuration={300} skipDelayDuration={200}>
            {children}
            <Toaster
              position="bottom-right"
              toastOptions={{
                classNames: {
                  toast: "!rounded-md !border !border-border !bg-popover !text-foreground !shadow-md !text-[13px]",
                  description: "!text-muted-foreground",
                },
              }}
            />
          </TooltipPrimitive.Provider>
        </AuthProviderContext>
      </DataProviderContext>
    </QueryClientProvider>
  );
}
