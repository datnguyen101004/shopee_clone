import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { AuthRandom } from './auth-random';

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface AccessClaims {
  sub: string;
  sid: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

@Injectable()
export class AuthTokenService {
  constructor(
    @Inject(JwtService)
    private readonly jwt: JwtService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(AuthRandom) private readonly random: AuthRandom = new AuthRandom(),
  ) {}

  issueAccess(userId: string, sessionId: string, now: Date) {
    const issuedAt = Math.floor(now.getTime() / 1_000);
    const expiresAt = new Date((issuedAt + this.config.accessTokenTtlSeconds) * 1_000);
    const accessToken = this.jwt.sign(
      { sid: sessionId, iat: issuedAt },
      {
        secret: this.config.accessTokenSecret,
        algorithm: 'HS256',
        issuer: this.config.issuer,
        audience: this.config.audience,
        subject: userId,
        expiresIn: this.config.accessTokenTtlSeconds,
      },
    );
    return { accessToken, expiresAt };
  }

  verifyAccess(token: string): AccessClaims {
    const claims = this.jwt.verify<Record<string, unknown>>(token, {
      secret: this.config.accessTokenSecret,
      algorithms: ['HS256'],
      issuer: this.config.issuer,
      audience: this.config.audience,
    });
    if (
      typeof claims.sub !== 'string' ||
      typeof claims.sid !== 'string' ||
      typeof claims.iss !== 'string' ||
      typeof claims.aud !== 'string' ||
      typeof claims.iat !== 'number' ||
      typeof claims.exp !== 'number' ||
      !canonicalUuid.test(claims.sub) ||
      !canonicalUuid.test(claims.sid) ||
      !Number.isSafeInteger(claims.iat) ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp <= claims.iat ||
      claims.exp - claims.iat > this.config.accessTokenTtlSeconds
    ) {
      throw new Error('Invalid access credential claims');
    }
    return claims as unknown as AccessClaims;
  }

  createOpaqueToken(): string {
    return this.random.bytes(32).toString('base64url');
  }

  hashOpaqueToken(token: string, purpose: 'refresh' | 'reset'): string {
    return createHash('sha256').update(`${purpose}:${token}`, 'utf8').digest('hex');
  }

  createId(): string {
    return this.random.id();
  }

  isOpaqueToken(value: string): boolean {
    return /^[A-Za-z0-9_-]{43}$/.test(value);
  }
}
