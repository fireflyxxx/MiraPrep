"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const AppRuntime = dynamic(() => import("./AppRuntime"));

export default function LandingAwareProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (pathname === "/") return children;
  return <AppRuntime>{children}</AppRuntime>;
}
