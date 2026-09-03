import { randomBytes, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthRandom {
  bytes(size: number): Buffer {
    return randomBytes(size);
  }

  id(): string {
    return randomUUID();
  }
}
