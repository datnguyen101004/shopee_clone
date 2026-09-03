import { Module } from '@nestjs/common';
import { SellerOrderCompensationService } from './seller-order-compensation.service';

@Module({ providers: [SellerOrderCompensationService], exports: [SellerOrderCompensationService] })
export class SellerOrderCompensationModule {}
