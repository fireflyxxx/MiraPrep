"use client";

import {
  QueryClient,
  QueryClientProvider,
  type QueryKey,
  useQuery,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState, type ReactNode } from "react";
import { apiClient } from "./client";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) =>
          !(error instanceof Error && error.name === "ApiError") && failureCount < 2,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: 0 },
    },
  });
}

/** 后续页面传入 key 和接口路径即可复用统一的 React Query 请求状态。 */
export function useApiQuery<T>(queryKey: QueryKey, path: string) {
  return useQuery({
    queryKey,
    queryFn: () => apiClient<T>(path),
  });
}

export default function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === "development" ? (
        <ReactQueryDevtools initialIsOpen={false} />
      ) : null}
    </QueryClientProvider>
  );
}
