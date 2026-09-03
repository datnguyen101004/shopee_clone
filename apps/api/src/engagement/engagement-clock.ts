import { Injectable } from '@nestjs/common';

@Injectable()
export class EngagementClock {
  now(): Date {
    return new Date();
  }
}
