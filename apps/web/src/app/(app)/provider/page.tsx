"use client";

import { buttonStyles } from "@/components/button-styles";
import { useSession } from "../_components/session";

// TEMPORARY until the provider flow is built.
export default function ProviderHomePage() {
  const { me, status, signOut } = useSession();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-extrabold tracking-tight">You’re in</h1>
      <p className="text-muted">
        Signed in as <strong className="text-text">{me.phone}</strong>. Live connection: {status}. The vulcanizer
        screens come after the driver flow.
      </p>
      <button type="button" onClick={signOut} className={buttonStyles({ variant: "outline", className: "w-full" })}>
        Log out
      </button>
    </div>
  );
}
