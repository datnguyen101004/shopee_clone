import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CartController } from './cart.controller';
import { CartExceptionFilter } from './cart-exception.filter';
import { CartService } from './cart.service';

@Module({
  imports: [AuthModule],
  controllers: [CartController],
  providers: [CartExceptionFilter, CartService],
  exports: [CartService],
})
export class CartModule {}
