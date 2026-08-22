import { Injectable } from '@nestjs/common';

export interface ReturnClock {
  now(): Date;
}

@Injectable()
export class SystemReturnClock implements ReturnClock {
  now(): Date {
    return new Date();
  }
}
