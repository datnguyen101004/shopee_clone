import { Injectable } from '@nestjs/common';

@Injectable()
export class ShopStorefrontClock {
  now(): Date {
    return new Date();
  }
}
