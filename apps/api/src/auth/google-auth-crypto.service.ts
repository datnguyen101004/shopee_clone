import { createCipheriv, createDecipheriv, createHash, createHmac } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { GoogleSignInFailedError } from './auth.errors';
import { AuthRandom } from './auth-random';

interface ProtectedTransaction {
  nonce: string;
  verifier: string;
}

@Injectable()
export class GoogleAuthCryptoService {
  private readonly encryptionKey: Buffer;

  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(AuthRandom) private readonly random: AuthRandom,
  ) {
    this.encryptionKey = createHmac('sha256', config.accessTokenSecret)
      .update('google-oauth-transaction-encryption:v1', 'utf8')
      .digest();
  }

  randomValue(): string {
    return this.random.bytes(32).toString('base64url');
  }

  id(): string {
    return this.random.id();
  }

  digest(value: string, purpose: 'state' | 'browser' | 'nonce'): string {
    return createHmac('sha256', this.config.limiterSecret)
      .update(`google-oauth-${purpose}:${value}`, 'utf8')
      .digest('hex');
  }

  pkceChallenge(verifier: string): string {
    return createHash('sha256').update(verifier, 'ascii').digest('base64url');
  }

  protect(input: ProtectedTransaction): string {
    const initializationVector = this.random.bytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, initializationVector);
    cipher.setAAD(Buffer.from('google-oauth-transaction:v1', 'utf8'));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(input), 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      initializationVector.toString('base64url'),
      ciphertext.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
    ].join('.');
  }

  unprotect(value: string): ProtectedTransaction {
    try {
      const [version, rawIv, rawCiphertext, rawTag, extra] = value.split('.');
      if (version !== 'v1' || !rawIv || !rawCiphertext || !rawTag || extra) {
        throw new Error('invalid envelope');
      }
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey,
        Buffer.from(rawIv, 'base64url'),
      );
      decipher.setAAD(Buffer.from('google-oauth-transaction:v1', 'utf8'));
      decipher.setAuthTag(Buffer.from(rawTag, 'base64url'));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(rawCiphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
      const parsed = JSON.parse(plaintext) as Partial<ProtectedTransaction>;
      if (
        typeof parsed.nonce !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(parsed.nonce) ||
        typeof parsed.verifier !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(parsed.verifier)
      ) {
        throw new Error('invalid payload');
      }
      return { nonce: parsed.nonce, verifier: parsed.verifier };
    } catch {
      throw new GoogleSignInFailedError();
    }
  }
}
