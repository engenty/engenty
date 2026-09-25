import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { useState } from "react";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Hidden tabs skip interval fetches (TanStack default). Pin it so a
        // library upgrade cannot start background poll bursts again.
        refetchIntervalInBackground: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

export function EngentyQueryProvider({ children }: PropsWithChildren) {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
