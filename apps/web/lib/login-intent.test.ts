import { safeProductLoginIntent } from './login-intent';

const productId = '00000000-0000-4000-8000-000000000010';
const variantId = '00000000-0000-4000-8000-000000000011';

describe('safeProductLoginIntent', () => {
  it('accepts only a matching canonical product return path', () => {
    expect(
      safeProductLoginIntent({
        intent: 'buy-now',
        productId,
        variantId,
        quantity: '2',
        returnTo: `/products/${productId}`,
      }),
    ).toEqual({
      intent: 'buy-now',
      productId,
      variantId,
      quantity: '2',
      returnTo: `/products/${productId}`,
    });
  });

  it.each([
    { intent: 'checkout', productId, variantId, quantity: '1', returnTo: `/products/${productId}` },
    {
      intent: 'add-to-cart',
      productId,
      variantId,
      quantity: '0',
      returnTo: `/products/${productId}`,
    },
    {
      intent: 'add-to-cart',
      productId,
      variantId,
      quantity: '1',
      returnTo: 'https://attacker.example',
    },
    {
      intent: 'add-to-cart',
      productId,
      variantId: ['duplicate'],
      quantity: '1',
      returnTo: `/products/${productId}`,
    },
  ])('rejects incomplete or unsafe intent fields', (value) => {
    expect(safeProductLoginIntent(value)).toBeNull();
  });
});
