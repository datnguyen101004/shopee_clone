import { Module } from '@nestjs/common';

import { FakePaymentProvider } from './fake-payment-provider';
import { loadMomoConfig, MOMO_CONFIG, type MomoConfig } from './momo.config';
import { MomoSandboxHttpTransport } from './momo-http.transport';
import { MomoPaymentProvider, type MomoHttpTransport } from './momo-payment-provider';
import { MomoResultCodeMetrics } from './momo-result-code';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider.port';
import { OnlinePaymentService } from './online-payment.service';
import { PaymentObservationService } from './payment-observation.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { RefundReconciliationService } from './refund-reconciliation.service';
import { CheckoutModule } from '../checkout/checkout.module';
import { InventoryModule } from '../inventory/inventory.module';
import { VouchersModule } from '../vouchers/vouchers.module';
import { MomoIpnController } from './momo-ipn.controller';
import { PaymentsController } from './payments.controller';
import { AuthModule } from '../auth/auth.module';
import { CheckoutExceptionFilter } from '../checkout/checkout-exception.filter';

export const MOMO_HTTP_TRANSPORT = Symbol('MOMO_HTTP_TRANSPORT');

@Module({
  imports: [AuthModule, CheckoutModule, InventoryModule, VouchersModule],
  controllers: [MomoIpnController, PaymentsController],
  providers: [
    { provide: MOMO_CONFIG, useFactory: (): MomoConfig => loadMomoConfig() },
    {
      provide: MOMO_HTTP_TRANSPORT,
      useFactory: (): MomoHttpTransport => new MomoSandboxHttpTransport(),
    },
    MomoResultCodeMetrics,
    OnlinePaymentService,
    PaymentObservationService,
    PaymentReconciliationService,
    RefundReconciliationService,
    CheckoutExceptionFilter,
    {
      provide: PAYMENT_PROVIDER,
      inject: [MOMO_CONFIG, MOMO_HTTP_TRANSPORT, MomoResultCodeMetrics],
      useFactory: (
        config: MomoConfig,
        transport: MomoHttpTransport,
        metrics: MomoResultCodeMetrics,
      ): PaymentProvider =>
        config.enabled
          ? new MomoPaymentProvider(config, transport, metrics)
          : new FakePaymentProvider(),
    },
  ],
  exports: [
    MOMO_CONFIG,
    PAYMENT_PROVIDER,
    MomoResultCodeMetrics,
    OnlinePaymentService,
    PaymentObservationService,
    PaymentReconciliationService,
    RefundReconciliationService,
  ],
})
export class PaymentsModule {}
