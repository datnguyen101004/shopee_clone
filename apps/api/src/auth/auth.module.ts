import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthClock } from './auth-clock';
import { AUTH_CONFIG, loadAuthConfig, type AuthConfig } from './auth.config';
import { AuthController } from './auth.controller';
import { AdminRoleController } from './admin-role.controller';
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
import { MarketplaceOwnershipService } from './marketplace-ownership.service';
import { RolesGuard } from './role-authorization.guard';
import { RoleAuthorizationService } from './role-authorization.service';
import { SellerController } from './seller.controller';

@Module({
  imports: [JwtModule.register({})],
  controllers: [
    AuthController,
    GoogleAuthCallbackController,
    SellerController,
    AdminRoleController,
  ],
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
    RolesGuard,
    MarketplaceOwnershipService,
    RoleAuthorizationService,
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
  exports: [
    AUTH_CONFIG,
    AuthGuard,
    AuthOriginGuard,
    AuthTokenService,
    RolesGuard,
    AuthService,
    MarketplaceOwnershipService,
    RoleAuthorizationService,
  ],
})
export class AuthModule {}
