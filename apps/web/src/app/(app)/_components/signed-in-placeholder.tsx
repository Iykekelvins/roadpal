"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@repo/shared";
import { buttonStyles } from "@/components/button-styles";
import { api, getAccessToken } from "@/lib/api";
import { HOME, logout, restoreSession, type Me } from "@/lib/auth";

// TEMPORARY: stands in for the driver/provider home screens until they're built. Proves the
// session works: right after login (token in memory) and after a reload (restored from the cookie).
export function SignedInPlaceholder({ role }: { role: UserRole }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    // After login the access token is already in memory; after a reload it's gone, so use the cookie.
    (getAccessToken() ? api<Me>("/users/me") : restoreSession())
      .then((user) => {
        if (!user) router.replace(`/login?as=${role}`);
        else if (user.role !== role) router.replace(HOME[user.role]);
        else setMe(user);
      })
      .catch(() => router.replace(`/login?as=${role}`));
  }, [role, router]);

  if (!me) return <p className="text-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-extrabold tracking-tight">You’re in</h1>
      <p className="text-muted">
        Signed in as <strong className="text-text">{me.phone}</strong> ({me.role}). The {role} screens come next.
      </p>
      <button
        type="button"
        onClick={async () => {
          await logout().catch(() => {});
          router.replace("/login");
        }}
        className={buttonStyles({ variant: "outline", className: "w-full" })}
      >
        Log out
      </button>
    </div>
  );
}
