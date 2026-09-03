export const INVENTORY_DEFAULT_PAGE_SIZE = 20;
export const INVENTORY_MAX_PAGE_SIZE = 50;
export const INVENTORY_ADJUSTMENT_NOTE_MAX_LENGTH = 500;
export const INVENTORY_VERSION = 'inventory-v1' as const;
export const INVENTORY_IDEMPOTENCY_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const inventoryAdjustmentReasonValues = [
  'INITIAL_STOCK',
  'PRODUCT_EDIT',
  'RESTOCK',
  'DAMAGE',
  'RETURN',
  'CORRECTION',
] as const;
export type InventoryAdjustmentReason = (typeof inventoryAdjustmentReasonValues)[number];

export interface InventoryBalance {
  variantId: string;
  productId: string;
  productName: string;
  productImageUrl: string | null;
  variantName: string;
  sku: string;
  lifecycle: 'active' | 'inactive';
  quantityOnHand: number;
  quantityReserved: number;
  quantitySold: number;
  availableQuantity: number;
  lowStock: boolean;
  version: number;
  updatedAt: string;
}

export interface InventoryPage {
  items: InventoryBalance[];
  nextCursor: string | null;
}

export interface InventoryAdjustmentRequest {
  delta: number;
  reason: InventoryAdjustmentReason;
  note: string | null;
}

export interface InventoryAdjustment {
  id: string;
  variantId: string;
  actorUserId: string | null;
  reason: InventoryAdjustmentReason;
  note: string | null;
  delta: number;
  quantityOnHandBefore: number;
  quantityOnHandAfter: number;
  quantityReserved: number;
  quantitySold: number;
  availableQuantity: number;
  inventoryVersion: number;
  idempotencyKey: string | null;
  occurredAt: string;
}

export interface InventoryAdjustmentPage {
  items: InventoryAdjustment[];
  nextCursor: string | null;
}

export interface InventoryProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  code?: string;
  invalidParameters?: string[];
  currentVersion?: number;
  availableQuantity?: number;
}

/** Canonical, framework-neutral representation used before hashing a request digest. */
export function canonicalInventoryAdjustmentRequest(input: InventoryAdjustmentRequest): string {
  return JSON.stringify({ delta: input.delta, note: input.note === null ? null : input.note.trim().replace(/\s+/g, ' '), reason: input.reason });
}

export function canonicalInventoryUtcTimestamp(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  const parsed = new Date(value);
  return parsed.toISOString() === value ? value : null;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const cursorPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const etagPattern = /^"inventory-([0-9]+)"$/;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isUuid = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);
const safeInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const nonNegative = (value: unknown): value is number => safeInteger(value) && value >= 0;
const exact = (value: Record<string, unknown>, required: string[], optional: string[] = []): boolean => {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.has(key));
};
const canonicalDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

export function parseInventoryVersionEtag(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = etagPattern.exec(value);
  if (!match) return null;
  const version = Number(match[1]);
  return Number.isSafeInteger(version) && version >= 0 ? version : null;
}

export function formatInventoryVersionEtag(version: number): string {
  if (!Number.isSafeInteger(version) || version < 0) throw new RangeError('Invalid inventory version');
  return `"inventory-${version}"`;
}

export function parseInventoryIdempotencyKey(value: unknown): string | null {
  return typeof value === 'string' && INVENTORY_IDEMPOTENCY_KEY_PATTERN.test(value) ? value : null;
}

export function parseInventoryPageQuery(value: unknown): { cursor: string | null; limit: number; productId: string | null; lowStock: boolean | null } | null {
  if (!isRecord(value) || !exact(value, [], ['cursor', 'limit', 'productId', 'lowStock'])) return null;
  const cursor = value.cursor === undefined ? null : value.cursor;
  const productId = value.productId === undefined ? null : value.productId;
  const rawLimit = value.limit === undefined ? String(INVENTORY_DEFAULT_PAGE_SIZE) : value.limit;
  const rawLowStock = value.lowStock === undefined ? null : value.lowStock;
  const lowStock = rawLowStock === null ? null : rawLowStock === true || rawLowStock === 'true' ? true : rawLowStock === false || rawLowStock === 'false' ? false : rawLowStock;
  if ((cursor !== null && (typeof cursor !== 'string' || !cursorPattern.test(cursor))) || (productId !== null && !isUuid(productId)) || typeof rawLimit !== 'string' || !/^[1-9][0-9]*$/.test(rawLimit) || (lowStock !== null && typeof lowStock !== 'boolean')) return null;
  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit > INVENTORY_MAX_PAGE_SIZE) return null;
  return { cursor: cursor as string | null, limit, productId: productId as string | null, lowStock: lowStock as boolean | null };
}

export function parseInventoryAdjustmentRequest(value: unknown): InventoryAdjustmentRequest | null {
  if (!isRecord(value) || !exact(value, ['delta', 'reason', 'note']) || !safeInteger(value.delta) || value.delta === 0 || typeof value.reason !== 'string' || !inventoryAdjustmentReasonValues.includes(value.reason as InventoryAdjustmentReason)) return null;
  if (value.note !== null && (typeof value.note !== 'string' || value.note.length > INVENTORY_ADJUSTMENT_NOTE_MAX_LENGTH)) return null;
  const note = value.note === null ? null : value.note.trim().replace(/\s+/g, ' ');
  if (note !== null && note.length > INVENTORY_ADJUSTMENT_NOTE_MAX_LENGTH) return null;
  return { delta: value.delta, reason: value.reason as InventoryAdjustmentReason, note };
}

function isBalance(value: unknown): value is InventoryBalance {
  if (!isRecord(value) || !exact(value, ['variantId', 'productId', 'productName', 'productImageUrl', 'variantName', 'sku', 'lifecycle', 'quantityOnHand', 'quantityReserved', 'quantitySold', 'availableQuantity', 'lowStock', 'version', 'updatedAt'])) return false;
  return isUuid(value.variantId) && isUuid(value.productId) && typeof value.productName === 'string' && (value.productImageUrl === null || typeof value.productImageUrl === 'string') && typeof value.variantName === 'string' && typeof value.sku === 'string' && (value.lifecycle === 'active' || value.lifecycle === 'inactive') && nonNegative(value.quantityOnHand) && nonNegative(value.quantityReserved) && nonNegative(value.quantitySold) && nonNegative(value.availableQuantity) && value.availableQuantity === value.quantityOnHand - value.quantityReserved && typeof value.lowStock === 'boolean' && nonNegative(value.version) && canonicalDate(value.updatedAt);
}

export function isInventoryPage(value: unknown): value is InventoryPage {
  return isRecord(value) && exact(value, ['items', 'nextCursor']) && Array.isArray(value.items) && value.items.every(isBalance) && (value.nextCursor === null || (typeof value.nextCursor === 'string' && cursorPattern.test(value.nextCursor)));
}

export function isInventoryAdjustment(value: unknown): value is InventoryAdjustment {
  if (!isRecord(value) || !exact(value, ['id', 'variantId', 'actorUserId', 'reason', 'note', 'delta', 'quantityOnHandBefore', 'quantityOnHandAfter', 'quantityReserved', 'quantitySold', 'availableQuantity', 'inventoryVersion', 'idempotencyKey', 'occurredAt'])) return false;
  return isUuid(value.id) && isUuid(value.variantId) && (value.actorUserId === null || isUuid(value.actorUserId)) && typeof value.reason === 'string' && inventoryAdjustmentReasonValues.includes(value.reason as InventoryAdjustmentReason) && (value.note === null || typeof value.note === 'string') && safeInteger(value.delta) && nonNegative(value.quantityOnHandBefore) && nonNegative(value.quantityOnHandAfter) && nonNegative(value.quantityReserved) && nonNegative(value.quantitySold) && nonNegative(value.availableQuantity) && value.availableQuantity === value.quantityOnHandAfter - value.quantityReserved && nonNegative(value.inventoryVersion) && (value.idempotencyKey === null || isUuid(value.idempotencyKey)) && canonicalDate(value.occurredAt);
}

export function isInventoryAdjustmentPage(value: unknown): value is InventoryAdjustmentPage {
  return isRecord(value) && exact(value, ['items', 'nextCursor']) && Array.isArray(value.items) && value.items.every(isInventoryAdjustment) && (value.nextCursor === null || (typeof value.nextCursor === 'string' && cursorPattern.test(value.nextCursor)));
}

export function isInventoryProblemDetails(value: unknown): value is InventoryProblemDetails {
  return isRecord(value) && typeof value.type === 'string' && typeof value.title === 'string' && typeof value.status === 'number' && Number.isInteger(value.status) && typeof value.detail === 'string' && (value.code === undefined || (typeof value.code === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(value.code))) && (value.invalidParameters === undefined || Array.isArray(value.invalidParameters)) && (value.currentVersion === undefined || nonNegative(value.currentVersion)) && (value.availableQuantity === undefined || nonNegative(value.availableQuantity));
}

export function parseInventoryPage(value: unknown): InventoryPage | null { return isInventoryPage(value) ? value : null; }
export function parseInventoryAdjustmentPage(value: unknown): InventoryAdjustmentPage | null { return isInventoryAdjustmentPage(value) ? value : null; }
