import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { AuthConfig } from './auth.config';

export const RECOVERY_MAILER = Symbol('RECOVERY_MAILER');

export interface RecoveryMessage {
  email: string;
  displayName: string;
  resetUrl: string;
  expiresAt: string;
}

export interface RecoveryMailer {
  sendPasswordReset(message: RecoveryMessage): Promise<void>;
}

export class CaptureRecoveryMailer implements RecoveryMailer {
  readonly messages: RecoveryMessage[] = [];

  constructor(private readonly capturePath: string | null = null) {}

  async sendPasswordReset(message: RecoveryMessage): Promise<void> {
    this.messages.push(structuredClone(message));
    if (this.capturePath) {
      await mkdir(path.dirname(this.capturePath), { recursive: true, mode: 0o700 });
      await appendFile(this.capturePath, `${JSON.stringify(message)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
    }
  }

  latest(): RecoveryMessage | null {
    return this.messages.at(-1) ?? null;
  }
}

export class FileRecoveryMailer implements RecoveryMailer {
  constructor(private readonly directory: string) {}

  async sendPasswordReset(message: RecoveryMessage): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const outputPath = path.join(this.directory, `password-reset-${randomUUID()}.json`);
    await writeFile(outputPath, `${JSON.stringify(message, null, 2)}\n`, {
      mode: 0o600,
      flag: 'wx',
    });
  }
}

export class WebhookRecoveryMailer implements RecoveryMailer {
  constructor(
    private readonly url: string,
    private readonly secret: string,
  ) {}

  async sendPasswordReset(message: RecoveryMessage): Promise<void> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error('Recovery provider rejected the message');
  }
}

export function createRecoveryMailer(config: AuthConfig): RecoveryMailer {
  if (config.recoveryMode === 'capture')
    return new CaptureRecoveryMailer(config.recoveryCapturePath);
  if (config.recoveryMode === 'file') return new FileRecoveryMailer(config.recoveryOutboxDirectory);
  if (!config.recoveryWebhookUrl || !config.recoveryWebhookSecret) {
    throw new Error('Recovery webhook configuration is unavailable.');
  }
  return new WebhookRecoveryMailer(config.recoveryWebhookUrl, config.recoveryWebhookSecret);
}
