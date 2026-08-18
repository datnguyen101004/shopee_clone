import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SellerProductsController } from './seller-products.controller';
import { SellerProductMediaController } from './seller-product-media.controller';
import { SellerProductsExceptionFilter } from './seller-products-exception.filter';
import { SellerProductMediaStorage } from './seller-product-media.storage';
import { SellerProductsService } from './seller-products.service';

@Module({ imports: [AuthModule, InventoryModule], controllers: [SellerProductsController, SellerProductMediaController], providers: [SellerProductsExceptionFilter, SellerProductMediaStorage, SellerProductsService], exports: [SellerProductMediaStorage] })
export class SellerProductsModule {}
