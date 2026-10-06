import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';

// Typed from Nest's own signature: it bundles its own copy of socket.io's types.
type IoServerOptions = Parameters<IoAdapter['createIOServer']>[1];

/** Socket.IO with CORS limited to our web app's origins (from config, not hard-coded in a decorator). */
export class CorsIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origins: string[],
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: IoServerOptions): ReturnType<IoAdapter['createIOServer']> {
    return super.createIOServer(port, { ...options!, cors: { origin: this.origins } });
  }
}
