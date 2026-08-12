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
import { GoogleAuthCallbackController } from './google-auth-callback.controller';
import { GoogleAuthCryptoService } from './google-auth-crypto.service';
import { GoogleAuthService } from './google-auth.service';
import { GOOGLE_IDENTITY_PROVIDER, GoogleOAuthIdentityProvider } from './google-identity-provider';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController, GoogleAuthCallbackController],
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
    GoogleAuthCryptoService,
    GoogleAuthService,
    { provide: GOOGLE_IDENTITY_PROVIDER, useClass: GoogleOAuthIdentityProvider },
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
