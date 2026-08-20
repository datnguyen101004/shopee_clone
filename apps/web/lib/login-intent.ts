import { isCanonicalProductId } from '@shopee-clone/contracts';

export interface ProductLoginIntent {
  intent: 'add-to-cart' | 'buy-now';
  productId: string;
  variantId: string;
  quantity: string;
  returnTo: string;
}

function one(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

export function safeProductLoginIntent(
  searchParams: Record<string, string | string[] | undefined>,
): ProductLoginIntent | null {
  const intent = one(searchParams.intent);
  const productId = one(searchParams.productId);
  const variantId = one(searchParams.variantId);
  const quantity = one(searchParams.quantity);
  const returnTo = one(searchParams.returnTo);
  if (
    !['add-to-cart', 'buy-now'].includes(intent ?? '') ||
    !productId ||
    !variantId ||
    !isCanonicalProductId(productId) ||
    !isCanonicalProductId(variantId) ||
    !quantity ||
    !/^[1-9]\d*$/.test(quantity) ||
    !returnTo ||
    !returnTo.startsWith('/products/') ||
    !isCanonicalProductId(returnTo.slice('/products/'.length))
  ) {

    return null;
  }
  return {
    intent: intent as ProductLoginIntent['intent'],
    productId,
    variantId,
    quantity,
    returnTo,
  };
}
