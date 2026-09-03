import { Injectable } from '@nestjs/common';

export const HOMEPAGE_CLOCK = Symbol('HOMEPAGE_CLOCK');

export interface HomepageClock {
  now(): Date;
}

@Injectable()
export class SystemHomepageClock implements HomepageClock {
  now(): Date {
    return new Date();
  }
}
