import { Injectable } from '@nestjs/common';

export interface UtcClock {
  now(): Date;
}

@Injectable()
export class SystemUtcClock implements UtcClock {
  now(): Date {
    return new Date();
  }
}
