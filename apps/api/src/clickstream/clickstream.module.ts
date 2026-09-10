import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClickstreamController } from './clickstream.controller';
import { CLICKSTREAM_CONFIG, loadClickstreamConfig } from './clickstream.config';
import { ClickstreamService } from './clickstream.service';
import { ClickstreamDispatcher, FetchClickstreamHttpAdapter } from './clickstream.dispatcher';
import { ClickstreamExceptionFilter } from './clickstream.exception-filter';

@Module({
  imports: [AuthModule],
  controllers: [ClickstreamController],
  providers: [
    { provide: CLICKSTREAM_CONFIG, useFactory: loadClickstreamConfig },
    ClickstreamService,
    ClickstreamExceptionFilter,
    FetchClickstreamHttpAdapter,
    ClickstreamDispatcher,
  ],
  exports: [CLICKSTREAM_CONFIG, ClickstreamService, ClickstreamDispatcher],
})
export class ClickstreamModule {}
