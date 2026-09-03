import { Module } from '@nestjs/common';

import { FakePaymentProvider } from './fake-payment-provider';
import { loadMomoConfig, MOMO_CONFIG, type MomoConfig } from './momo.config';
import { MomoSandboxHttpTransport } from './momo-http.transport';
import { MomoPaymentProvider, type MomoHttpTransport } from './momo-payment-provider';
import { MomoResultCodeMetrics } from './momo-result-code';
import { PAYMENT_PROVIDER, VNPAY_PROVIDER, type PaymentProvider } from './payment-provider.port';
import { OnlinePaymentService } from './online-payment.service';
import { PaymentObservationService } from './payment-observation.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { RefundReconciliationService } from './refund-reconciliation.service';
import { CheckoutModule } from '../checkout/checkout.module';
import { InventoryModule } from '../inventory/inventory.module';
import { VouchersModule } from '../vouchers/vouchers.module';
import { MomoIpnController } from './momo-ipn.controller';
import { VnpayIpnController } from './vnpay-ipn.controller';
import { PaymentsController } from './payments.controller';
import { AuthModule } from '../auth/auth.module';
import { CheckoutExceptionFilter } from '../checkout/checkout-exception.filter';
import { VNPAY_CONFIG, loadVnpayConfig, type VnpayConfig } from './vnpay.config';
import { VnpayPaymentProvider } from './vnpay-payment-provider';
import { VnpayResultCodeMetrics } from './vnpay-result-code';
import { PAYMENT_PROVIDER_REGISTRY, PaymentProviderRegistry } from './payment-provider.registry';

export const MOMO_HTTP_TRANSPORT = Symbol('MOMO_HTTP_TRANSPORT');

@Module({
  imports: [AuthModule, CheckoutModule, InventoryModule, VouchersModule],
  controllers: [MomoIpnController, VnpayIpnController, PaymentsController],
  providers: [
    { provide: MOMO_CONFIG, useFactory: (): MomoConfig => loadMomoConfig() },
    { provide: VNPAY_CONFIG, useFactory: (): VnpayConfig => loadVnpayConfig() },
    {
      provide: MOMO_HTTP_TRANSPORT,
      useFactory: (): MomoHttpTransport => new MomoSandboxHttpTransport(),
    },
    MomoResultCodeMetrics,
    VnpayResultCodeMetrics,
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
    {
      provide: VNPAY_PROVIDER,
      inject: [VNPAY_CONFIG],
      useFactory: (config: VnpayConfig): PaymentProvider =>
        config.enabled ? new VnpayPaymentProvider(config) : new FakePaymentProvider(),
    },
    {
      provide: PAYMENT_PROVIDER_REGISTRY,
      inject: [PAYMENT_PROVIDER, VNPAY_PROVIDER, VNPAY_CONFIG],
      useFactory: (
        momoProvider: PaymentProvider,
        vnpayProvider: PaymentProvider,
        vnpayConfig: VnpayConfig,
      ): PaymentProviderRegistry =>
        new PaymentProviderRegistry([
          // MoMo keeps its existing deterministic fake adapter when disabled;
          // VNPAY creation is guarded separately by OnlinePaymentService.
          { name: 'MOMO', provider: momoProvider, enabled: true },
          { name: 'VNPAY', provider: vnpayProvider, enabled: vnpayConfig.enabled },
        ]),
    },
  ],
  exports: [
    MOMO_CONFIG,
    VNPAY_CONFIG,
    PAYMENT_PROVIDER,
    VNPAY_PROVIDER,
    PAYMENT_PROVIDER_REGISTRY,
    MomoResultCodeMetrics,
    VnpayResultCodeMetrics,
    OnlinePaymentService,
    PaymentObservationService,
    PaymentReconciliationService,
    RefundReconciliationService,
  ],
})
export class PaymentsModule {}
