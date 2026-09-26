"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { PUBLIC_ROUTES, getToken, signOutTo } from "@/lib/auth";

/** Routes: no token → /signup; token that fails verification → /login?expired=1; otherwise the app.
 *  Public routes render immediately (and bounce signed-in users to the app). */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_ROUTES.includes(path);
  const [ready, setReady] = useState(isPublic);

  useEffect(() => {
    const token = getToken();
    if (isPublic) {
      if (token) api.me().then(() => router.replace("/")).catch(() => {});
      setReady(true);
      return;
    }
    if (!token) { router.replace("/signup"); return; }
    let cancelled = false;
    api.me().then(() => { if (!cancelled) setReady(true); }).catch(() => signOutTo(true));
    return () => { cancelled = true; };
  }, [path, isPublic, router]);

  if (!ready) return null;
  return <>{children}</>;
}
