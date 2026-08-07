"use client";

import RouteTransition from "@/components/RouteTransition";
import { Toaster } from "@/components/ui/sonner";
import QueryProvider from "@/lib/api/query-provider";

export default function AppRuntime({ children }: { children: React.ReactNode }) {
  return (
    <>
      <QueryProvider>
        <RouteTransition>{children}</RouteTransition>
      </QueryProvider>
      <Toaster richColors closeButton />
    </>
  );
}
