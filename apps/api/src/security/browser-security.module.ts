import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthModule } from '../auth/auth.module';
import { BrowserMutationGuard } from './browser-mutation.guard';

@Global()
@Module({
  imports: [AuthModule],
  providers: [BrowserMutationGuard, { provide: APP_GUARD, useExisting: BrowserMutationGuard }],
  exports: [BrowserMutationGuard],
})
export class BrowserSecurityModule {}
