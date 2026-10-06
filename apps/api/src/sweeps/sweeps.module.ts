import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { SweeperService } from './sweeper.service.js';

@Module({ imports: [RealtimeModule], providers: [SweeperService] })
export class SweepsModule {}
