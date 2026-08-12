import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthClock } from './auth-clock';
import { AUTH_CONFIG, loadAuthConfig, type AuthConfig } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthExceptionFilter } from './auth-exception.filter';
import { AuthGuard } from './auth.guard';
import { AuthLimiterService } from './auth-limiter.service';
import { AuthOriginGuard } from './auth-origin.guard';
import { AuthPasswordService } from './auth-password.service';
import { AuthRandom } from './auth-random';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { AuthTokenService } from './auth-token.service';
import { createRecoveryMailer, RECOVERY_MAILER } from './recovery-mailer';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    { provide: AUTH_CONFIG, useFactory: loadAuthConfig },
    {
      provide: RECOVERY_MAILER,
      inject: [AUTH_CONFIG],
      useFactory: (config: AuthConfig) => createRecoveryMailer(config),
    },
    AuthClock,
    AuthExceptionFilter,
    AuthGuard,
    AuthLimiterService,
    AuthOriginGuard,
    AuthPasswordService,
    AuthRandom,
    AuthRepository,
    AuthService,
    AuthTokenService,
  ],
  exports: [AuthGuard, AuthService],
})
export class AuthModule {}
