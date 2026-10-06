import { Inject, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  LatLngSchema,
  SOCKET_UNAUTHORIZED,
  type ClientToServerEvents,
  type LocationAck,
  type ServerToClientEvents,
} from '@repo/shared';
import type { Server, Socket } from 'socket.io';
import type { AccessTokenPayload } from '../auth/access-token.js';
import type { AuthUser } from '../auth/decorators.js';
import { DB, type Database } from '../db/database.module.js';
import { recordLiveLocation } from './record-live-location.js';

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

  constructor(
    private readonly jwt: JwtService,
    @Inject(DB) private readonly db: Database,
  ) {}

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

  /**
   * A provider's live position. The return value is sent back as the Socket.IO acknowledgement.
   * Stored (latest only, throttled) and relayed to the driver if the provider has an en-route job.
   */
  @SubscribeMessage('location:update')
  async onLocationUpdate(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown): Promise<LocationAck> {
    if (socket.data.user.role !== 'provider') return { error: 'NOT_ALLOWED' };
    const parsed = LatLngSchema.safeParse(body);
    if (!parsed.success) return { error: 'INVALID_LOCATION' };

    try {
      const result = await recordLiveLocation(this.db, socket.data.user.id, parsed.data);
      if (result.accepted && result.enRouteJob) {
        this.emitToUser(result.enRouteJob.driverId, 'job:location', {
          jobId: result.enRouteJob.id,
          location: parsed.data,
          at: result.at.toISOString(),
        });
      }
      return { accepted: result.accepted };
    } catch (error) {
      this.logger.error('location:update failed', error as Error);
      return { error: 'SERVER_ERROR' };
    }
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
