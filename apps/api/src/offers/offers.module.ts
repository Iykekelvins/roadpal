import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { OffersController } from './offers.controller.js';
import { OffersService } from './offers.service.js';

@Module({
  imports: [RealtimeModule],
  controllers: [OffersController],
  providers: [OffersService],
})
export class OffersModule {}
