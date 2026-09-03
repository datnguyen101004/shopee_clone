import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';

const mimeExtensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

@Injectable()
export class ReviewMediaStorage {
  private readonly root = process.env.REVIEW_MEDIA_ROOT ?? join(process.cwd(), '.runtime', 'review-media');
  async write(mimeType: string, data: Buffer): Promise<string> {
    const extension = mimeExtensions[mimeType];
    if (!extension) throw new Error('Unsupported review media MIME type');
    const key = `${randomUUID()}.${extension}`;
    await fs.mkdir(this.root, { recursive: true });
    await fs.writeFile(join(this.root, key), data, { flag: 'wx' });
    return key;
  }
  async read(key: string): Promise<Buffer | null> {
    if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key)) return null;
    try { return await fs.readFile(join(this.root, key)); } catch { return null; }
  }
  async remove(key: string): Promise<void> {
    if (/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key)) await fs.rm(join(this.root, key), { force: true });
  }
}
