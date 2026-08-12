import {
  AUTH_DISPLAY_NAME_MAX_LENGTH,
  AUTH_DISPLAY_NAME_MIN_LENGTH,
  isValidAuthEmail,
  normalizeAuthEmail,
} from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';

import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { GoogleSignInFailedError } from './auth.errors';

export const GOOGLE_IDENTITY_PROVIDER = Symbol('GOOGLE_IDENTITY_PROVIDER');

export interface VerifiedGoogleIdentity {
  subject: string;
  email: string;
  displayName: string;
}

export interface GoogleIdentityProvider {
  authorizationUrl(input: { state: string; nonce: string; codeChallenge: string }): string;
  exchange(input: {
    code: string;
    codeVerifier: string;
    expectedNonce: string;
  }): Promise<VerifiedGoogleIdentity>;
}

@Injectable()
export class GoogleOAuthIdentityProvider implements GoogleIdentityProvider {
  private readonly client: OAuth2Client;

  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {
    this.client = new OAuth2Client(
      config.google.clientId,
      config.google.clientSecret,
      config.google.callbackUrl,
    );
  }

  authorizationUrl(input: { state: string; nonce: string; codeChallenge: string }): string {
    return this.client.generateAuthUrl({
      access_type: 'online',
      scope: ['openid', 'email', 'profile'],
      state: input.state,
      nonce: input.nonce,
      code_challenge: input.codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      include_granted_scopes: false,
    });
  }

  async exchange(input: {
    code: string;
    codeVerifier: string;
    expectedNonce: string;
  }): Promise<VerifiedGoogleIdentity> {
    try {
      const result = await this.client.getToken({
        code: input.code,
        codeVerifier: input.codeVerifier,
        redirect_uri: this.config.google.callbackUrl,
      });
      const idToken = result.tokens.id_token;
      if (!idToken) throw new GoogleSignInFailedError();
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.config.google.clientId,
      });
      const payload = ticket.getPayload();
      const nowSeconds = Math.floor(Date.now() / 1_000);
      const subject = payload?.sub?.trim() ?? '';
      const email = normalizeAuthEmail(payload?.email ?? '');
      if (
        !payload ||
        !['https://accounts.google.com', 'accounts.google.com'].includes(payload.iss) ||
        payload.aud !== this.config.google.clientId ||
        !Number.isSafeInteger(payload.exp) ||
        payload.exp <= nowSeconds ||
        payload.nonce !== input.expectedNonce ||
        !/^[\x21-\x7E]{1,255}$/.test(subject) ||
        payload.email_verified !== true ||
        !isValidAuthEmail(email)
      ) {
        throw new GoogleSignInFailedError();
      }
      const proposedName = payload.name?.trim() ?? '';
      const emailName = email.slice(0, email.indexOf('@')).trim();
      const displayName =
        proposedName.length >= AUTH_DISPLAY_NAME_MIN_LENGTH &&
        proposedName.length <= AUTH_DISPLAY_NAME_MAX_LENGTH
          ? proposedName
          : emailName.slice(0, AUTH_DISPLAY_NAME_MAX_LENGTH);
      if (displayName.length < AUTH_DISPLAY_NAME_MIN_LENGTH) throw new GoogleSignInFailedError();
      return { subject, email, displayName };
    } catch (error) {
      if (error instanceof GoogleSignInFailedError) throw error;
      throw new GoogleSignInFailedError();
    }
  }
}
