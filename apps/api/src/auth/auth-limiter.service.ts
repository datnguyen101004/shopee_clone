import { createHmac } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { AuthRateLimitedError } from './auth.errors';

type Entry = { count: number; expiresAt: number };
type Limit = { max: number; windowSeconds: number };

@Injectable()
export class AuthLimiterService {
  private readonly entries = new Map<string, Entry>();

  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

  key(kind: string, raw: string): string {
    const digest = createHmac('sha256', this.config.limiterSecret)
      .update(`${kind}:${raw}`, 'utf8')
      .digest('hex');
    return `${kind}:${digest}`;
  }

  consume(key: string, limit: Limit, now: Date): void {
    const time = now.getTime();
    const current = this.entries.get(key);
    const entry =
      !current || current.expiresAt <= time
        ? { count: 0, expiresAt: time + limit.windowSeconds * 1_000 }
        : current;
    if (entry.count >= limit.max) {
      throw new AuthRateLimitedError(Math.max(1, Math.ceil((entry.expiresAt - time) / 1_000)));
    }
    entry.count += 1;
    this.entries.set(key, entry);
    if (this.entries.size > 10_000) this.prune(now);
  }

  clear(key: string): void {
    this.entries.delete(key);
  }

  prune(now: Date): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now.getTime()) this.entries.delete(key);
    }
  }
}
