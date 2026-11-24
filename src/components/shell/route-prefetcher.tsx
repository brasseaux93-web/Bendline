"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const CORE_ROUTES = [
  "/diagnostic",
  "/accuracy",
  "/practice",
  "/mock",
  "/draw",
  "/tools",
  "/progress",
  "/navigate",
  "/onboarding",
] as const;

export function RoutePrefetcher() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const prefetchAll = () => {
      if (cancelled) return;
      for (const route of CORE_ROUTES) {
        router.prefetch(route);
      }
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(prefetchAll, { timeout: 600 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }

    const timerId = setTimeout(prefetchAll, 150);
    return () => {
      cancelled = true;
      clearTimeout(timerId);
    };
  }, [router]);

  return null;
}
