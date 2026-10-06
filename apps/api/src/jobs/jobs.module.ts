import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { JobsController } from './jobs.controller.js';
import { JobsService } from './jobs.service.js';

@Module({
  imports: [RealtimeModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
