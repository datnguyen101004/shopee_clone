import { isSafeAuthReturnTo } from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import {
  AccountSuspendedError,
  GoogleAccountMethodRequiredError,
  GoogleSignInFailedError,
} from './auth.errors';
import { AuthClock } from './auth-clock';
import { AuthLimiterService } from './auth-limiter.service';
import { AuthRepository } from './auth.repository';
import { type AuthSessionResult, AuthService } from './auth.service';
import { GoogleAuthCryptoService } from './google-auth-crypto.service';
import { GOOGLE_IDENTITY_PROVIDER, type GoogleIdentityProvider } from './google-identity-provider';

export interface GoogleAuthStartResult {
  authorizationUrl: string;
  browserBinding: string;
}

export type GoogleAuthCompletion =
  | { outcome: 'success'; returnTo: string; session: AuthSessionResult }
  | {
      outcome: 'cancelled' | 'failed' | 'account-method-required' | 'account-and-shop-disabled';
      returnTo: string;
    };

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
}

@Injectable()
export class GoogleAuthService {
  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(AuthClock) private readonly clock: AuthClock,
    @Inject(AuthLimiterService) private readonly limiter: AuthLimiterService,
    @Inject(AuthRepository) private readonly repository: AuthRepository,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(GoogleAuthCryptoService) private readonly crypto: GoogleAuthCryptoService,
    @Inject(GOOGLE_IDENTITY_PROVIDER) private readonly provider: GoogleIdentityProvider,
  ) {}

  async start(returnTo: string | undefined, requestSource: string): Promise<GoogleAuthStartResult> {
    const now = this.clock.now();
    this.limiter.consume(
      this.limiter.key('google-start-source', requestSource),
      this.config.limits.googleStartSource,
      now,
    );
    const safeReturnTo = isSafeAuthReturnTo(returnTo) ? returnTo : '/';
    const state = this.crypto.randomValue();
    const browserBinding = this.crypto.randomValue();
    const nonce = this.crypto.randomValue();
    const verifier = this.crypto.randomValue();
    await this.repository.createGoogleLoginAttempt({
      id: this.crypto.id(),
      stateHash: this.crypto.digest(state, 'state'),
      browserBindingHash: this.crypto.digest(browserBinding, 'browser'),
      nonceHash: this.crypto.digest(nonce, 'nonce'),
      protectedPayload: this.crypto.protect({ nonce, verifier }),
      returnTo: safeReturnTo,
      expiresAt: new Date(now.getTime() + this.config.google.transactionTtlSeconds * 1_000),
      now,
    });
    return {
      browserBinding,
      authorizationUrl: this.provider.authorizationUrl({
        state,
        nonce,
        codeChallenge: this.crypto.pkceChallenge(verifier),
      }),
    };
  }

  async complete(input: {
    state: string | undefined;
    code: string | undefined;
    providerError: string | undefined;
    browserBinding: string | undefined;
    requestSource: string;
  }): Promise<GoogleAuthCompletion> {
    const now = this.clock.now();
    this.limiter.consume(
      this.limiter.key('google-callback-source', input.requestSource),
      this.config.limits.googleCallbackSource,
      now,
    );
    if (
      !input.state ||
      !/^[A-Za-z0-9_-]{43}$/.test(input.state) ||
      !input.browserBinding ||
      !/^[A-Za-z0-9_-]{43}$/.test(input.browserBinding)
    ) {
      throw new GoogleSignInFailedError();
    }
    const attempt = await this.repository.consumeGoogleLoginAttempt({
      stateHash: this.crypto.digest(input.state, 'state'),
      browserBindingHash: this.crypto.digest(input.browserBinding, 'browser'),
      now,
    });
    if (!attempt) throw new GoogleSignInFailedError();
    const payload = this.crypto.unprotect(attempt.protectedPayload);
    if (this.crypto.digest(payload.nonce, 'nonce') !== attempt.nonceHash) {
      throw new GoogleSignInFailedError();
    }
    if (input.providerError) {
      return {
        outcome: input.providerError === 'access_denied' ? 'cancelled' : 'failed',
        returnTo: attempt.returnTo,
      };
    }
    if (!input.code || input.code.length > 4_096 || containsControlCharacter(input.code)) {
      throw new GoogleSignInFailedError();
    }
    const identity = await this.provider.exchange({
      code: input.code,
      codeVerifier: payload.verifier,
      expectedNonce: payload.nonce,
    });
    let session: AuthSessionResult;
    try {
      session = await this.auth.loginWithGoogle(identity);
    } catch (error) {
      if (error instanceof GoogleAccountMethodRequiredError) {
        return { outcome: 'account-method-required', returnTo: attempt.returnTo };
      }
      if (error instanceof AccountSuspendedError) {
        return { outcome: 'account-and-shop-disabled', returnTo: attempt.returnTo };
      }
      throw error;
    }
    return { outcome: 'success', returnTo: attempt.returnTo, session };
  }
}
