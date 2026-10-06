import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  SOCKET_UNAUTHORIZED,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@repo/shared';
import type { Server, Socket } from 'socket.io';
import type { AccessTokenPayload } from '../auth/access-token.js';
import type { AuthUser } from '../auth/decorators.js';

interface SocketData {
  user: AuthUser;
  expiryTimer?: NodeJS.Timeout;
}

type AppServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** Every socket of a user joins this room, so one emit reaches all their devices. */
export const userRoom = (userId: string) => `user:${userId}`;

@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer() private readonly server!: AppServer;

  constructor(private readonly jwt: JwtService) {}

  afterInit(server: AppServer) {
    // Authenticate during the handshake: a bad token never becomes a connection.
    server.use(async (socket, next) => {
      const token: unknown = socket.handshake.auth?.token;
      if (typeof token !== 'string') return next(new Error(SOCKET_UNAUTHORIZED));
      try {
        const payload = await this.jwt.verifyAsync<AccessTokenPayload & { exp: number }>(token);
        socket.data.user = { id: payload.sub, role: payload.role };
        // Sockets outlive tokens; cut the connection when the token expires so revocation still
        // takes effect within the access-token lifetime. The client refreshes and reconnects.
        socket.data.expiryTimer = setTimeout(() => {
          socket.emit('session:expired');
          socket.disconnect(true);
        }, payload.exp * 1000 - Date.now());
        next();
      } catch {
        next(new Error(SOCKET_UNAUTHORIZED));
      }
    });
  }

  async handleConnection(socket: AppSocket) {
    await socket.join(userRoom(socket.data.user.id));
    this.logger.debug(`connected ${socket.data.user.role} ${socket.data.user.id}`);
  }

  handleDisconnect(socket: AppSocket) {
    clearTimeout(socket.data.expiryTimer);
  }

  /** Push an event to every connected device of a user. A no-op if they're offline. */
  emitToUser<E extends keyof ServerToClientEvents>(
    userId: string,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ) {
    this.server.to(userRoom(userId)).emit(event, ...args);
  }
}
