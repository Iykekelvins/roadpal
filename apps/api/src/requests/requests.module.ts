import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { RequestsController } from './requests.controller.js';
import { RequestsService } from './requests.service.js';

@Module({
  imports: [RealtimeModule],
  controllers: [RequestsController],
  providers: [RequestsService],
})
export class RequestsModule {}
