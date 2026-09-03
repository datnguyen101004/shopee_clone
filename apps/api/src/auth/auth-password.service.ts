import { createHash, scrypt as nodeScrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

import { isAcceptedAuthPassword } from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { AuthInputError } from './auth.errors';
import { AuthRandom } from './auth-random';

function scrypt(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

@Injectable()
export class AuthPasswordService {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(AuthRandom) private readonly random: AuthRandom = new AuthRandom(),
  ) {}

  assertAccepted(password: string): void {
    if (!isAcceptedAuthPassword(password)) throw new AuthInputError(['password']);
  }

  async hash(password: string): Promise<string> {
    this.assertAccepted(password);
    const salt = this.random.bytes(16);
    const derived = await this.derive(password, salt, this.config.scrypt);
    return [
      'scrypt',
      '1',
      String(this.config.scrypt.cost),
      String(this.config.scrypt.blockSize),
      String(this.config.scrypt.parallelization),
      salt.toString('base64url'),
      derived.toString('base64url'),
    ].join('$');
  }

  async verify(password: string, envelope: string | null): Promise<boolean> {
    const parsed = envelope ? this.parse(envelope) : null;
    if (!parsed) {
      const dummySalt = createHash('sha256')
        .update('shopee-clone-auth-dummy')
        .digest()
        .subarray(0, 16);
      await this.derive(password.slice(0, 128), dummySalt, this.config.scrypt);
      return false;
    }
    const actual = await this.derive(password, parsed.salt, parsed.policy);
    return actual.length === parsed.hash.length && timingSafeEqual(actual, parsed.hash);
  }

  needsRehash(envelope: string): boolean {
    const parsed = this.parse(envelope);
    return (
      !parsed ||
      parsed.policy.cost !== this.config.scrypt.cost ||
      parsed.policy.blockSize !== this.config.scrypt.blockSize ||
      parsed.policy.parallelization !== this.config.scrypt.parallelization ||
      parsed.policy.keyLength !== this.config.scrypt.keyLength
    );
  }

  private parse(envelope: string) {
    const parts = envelope.split('$');
    if (parts.length !== 7 || parts[0] !== 'scrypt' || parts[1] !== '1') return null;
    const cost = Number(parts[2]);
    const blockSize = Number(parts[3]);
    const parallelization = Number(parts[4]);
    if (
      !Number.isSafeInteger(cost) ||
      !Number.isSafeInteger(blockSize) ||
      !Number.isSafeInteger(parallelization) ||
      cost < 1_024 ||
      cost > 1_048_576 ||
      (cost & (cost - 1)) !== 0 ||
      blockSize < 1 ||
      blockSize > 32 ||
      parallelization < 1 ||
      parallelization > 8
    ) {
      return null;
    }
    try {
      const salt = Buffer.from(parts[5]!, 'base64url');
      const hash = Buffer.from(parts[6]!, 'base64url');
      if (salt.length !== 16 || hash.length < 32 || hash.length > 128) return null;
      return {
        salt,
        hash,
        policy: { cost, blockSize, parallelization, keyLength: hash.length, maxConcurrency: 1 },
      };
    } catch {
      return null;
    }
  }

  private async derive(
    password: string,
    salt: Buffer,
    policy: AuthConfig['scrypt'],
  ): Promise<Buffer> {
    await this.acquire();
    try {
      const maxmem = Math.max(
        32 * 1024 * 1024,
        128 * policy.cost * policy.blockSize + 2 * 1024 * 1024,
      );
      return await scrypt(password, salt, policy.keyLength, {
        N: policy.cost,
        r: policy.blockSize,
        p: policy.parallelization,
        maxmem,
      });
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.active < this.config.scrypt.maxConcurrency) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active += 1;
  }

  private release(): void {
    this.active -= 1;
    this.waiters.shift()?.();
  }
}
