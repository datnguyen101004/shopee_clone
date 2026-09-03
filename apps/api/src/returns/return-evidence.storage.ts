import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const keyPattern = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

@Injectable()
export class ReturnEvidenceStorage {
  private readonly root =
    process.env.RETURN_EVIDENCE_ROOT ?? join(process.cwd(), '.runtime', 'return-evidence');

  async write(mimeType: string, data: Buffer): Promise<string> {
    const extension = extensions[mimeType];
    if (!extension) throw new Error('Unsupported return evidence MIME type');
    const key = `${randomUUID()}.${extension}`;
    await fs.mkdir(this.root, { recursive: true });
    await fs.writeFile(join(this.root, key), data, { flag: 'wx' });
    return key;
  }

  async read(key: string): Promise<Buffer | null> {
    if (!keyPattern.test(key)) return null;
    try {
      return await fs.readFile(join(this.root, key));
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    if (keyPattern.test(key)) await fs.rm(join(this.root, key), { force: true });
  }
}
