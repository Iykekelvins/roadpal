"use client";

import { createContext, use, useEffect, useEffectEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { SOCKET_UNAUTHORIZED, type ServerToClientEvents, type UserRole } from "@repo/shared";
import { buttonStyles } from "@/components/button-styles";
import { api, getAccessToken, NetworkError, refreshSession } from "@/lib/api";
import { HOME, logout, restoreSession, type Me } from "@/lib/auth";
import { createSocket, type AppSocket } from "@/lib/realtime";

type ConnectionStatus = "connecting" | "online";

interface Session {
  me: Me;
  socket: AppSocket;
  status: ConnectionStatus;
  /**
   * Goes up on every successful (re)connect. Pushes sent while offline are lost, so screens put
   * this in their effect dependencies to refetch the REST view whenever the connection comes back.
   */
  connection: number;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = use(SessionContext);
  if (!session) throw new Error("useSession must be used inside <SessionProvider>");
  return session;
}

/** Subscribes to a server event for as long as the component is mounted. */
export function useSocketEvent<E extends keyof ServerToClientEvents>(event: E, handler: ServerToClientEvents[E]) {
  const { socket } = useSession();
  // An effect event always sees the latest props/state, without re-subscribing on every render.
  const onEvent = useEffectEvent(handler as (...args: unknown[]) => void);
  useEffect(() => {
    const listener = (...args: unknown[]) => onEvent(...args);
    socket.on(event, listener as never);
    return () => void socket.off(event, listener as never);
  }, [socket, event]);
}

/**
 * Gate for signed-in screens: restores the session (or sends you to log in), checks the role,
 * and keeps one realtime connection open, re-authenticating it when the access token expires.
 */
export function SessionProvider({ role, children }: { role: UserRole; children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [offline, setOffline] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Created once, not connected yet (autoConnect: false). Browser only: never on the server render.
  const [socket] = useState(() => (typeof window === "undefined" ? null : createSocket()));
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [connection, setConnection] = useState(0);

  // 1. Who is this? Right after login the token is in memory; after a reload, use the cookie.
  useEffect(() => {
    let ignore = false;
    (getAccessToken() ? api<Me>("/users/me") : restoreSession())
      .then((user) => {
        if (ignore) return;
        if (!user) router.replace(`/login?as=${role}`);
        else if (user.role !== role) router.replace(HOME[user.role]);
        else setMe(user);
      })
      .catch((error) => {
        if (ignore) return;
        // No signal isn't "logged out": keep them here with a retry instead of bouncing to login.
        if (error instanceof NetworkError) setOffline(true);
        else router.replace(`/login?as=${role}`);
      });
    return () => {
      ignore = true;
    };
  }, [role, router, attempt]);

  // 2. One socket for the whole signed-in area, connected once we know who's signed in.
  useEffect(() => {
    if (!me || !socket) return;
    const s = socket;
    let stopped = false;

    // The server refused or dropped us because the access token expired. Refresh, then reconnect.
    // (Socket.IO doesn't retry these by itself: only network failures are retried automatically.)
    async function reauthenticate() {
      try {
        const session = await refreshSession();
        if (stopped) return;
        if (session) s.connect();
        else router.replace(`/login?as=${role}`); // refresh token gone: really logged out
      } catch {
        if (!stopped) setTimeout(reauthenticate, 3000); // no signal: try again shortly
      }
    }

    const onConnect = () => {
      setStatus("online");
      setConnection((n) => n + 1);
    };
    const onDisconnect = (reason: string) => {
      setStatus("connecting");
      if (reason === "io server disconnect") void reauthenticate(); // sent after session:expired
    };
    const onConnectError = (error: Error) => {
      setStatus("connecting");
      if (error.message === SOCKET_UNAUTHORIZED) void reauthenticate();
    };
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("connect_error", onConnectError);
    s.connect();

    return () => {
      stopped = true;
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("connect_error", onConnectError);
      s.disconnect();
    };
  }, [me, socket, role, router]);

  async function signOut() {
    socket?.disconnect();
    await logout().catch(() => {});
    router.replace("/login");
  }

  if (offline) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-extrabold tracking-tight">No connection</h1>
        <p className="text-muted">Check your signal and try again.</p>
        <button
          type="button"
          onClick={() => {
            setOffline(false);
            setAttempt((n) => n + 1);
          }}
          className={buttonStyles({ variant: "primary", className: "w-full" })}
        >
          Try again
        </button>
      </div>
    );
  }

  if (!me || !socket) return <p className="text-muted">Loading…</p>;

  return (
    <SessionContext value={{ me, socket, status, connection, signOut }}>
      {/* Only after a first successful connection: the initial connect is part of "Loading". */}
      {status !== "online" && connection > 0 && (
        <p role="status" className="mb-6 flex items-center gap-2 rounded-2xl bg-signal-soft px-4 py-3 text-sm font-semibold text-on-signal-soft">
          <span className="size-2 animate-pulse rounded-full bg-signal" aria-hidden="true" />
          Reconnecting… live updates will catch up when you’re back.
        </p>
      )}
      {children}
    </SessionContext>
  );
}
