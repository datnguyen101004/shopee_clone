import { LEGACY_VIETNAM_PROVINCE_REGIONS, normalizeVietnameseAdministrativeName } from './vietnam-provinces';

/**
 * Contracts shared by the marketplace and the local Demo Carrier service.
 *
 * The carrier is deliberately represented as a provider/version union. This
 * keeps historical `MOCK/mock-v1` order snapshots readable while allowing new
 * quotes and shipments to expose distance-based simulation details.
 */

export const DEMO_CARRIER_PROVIDER = 'DEMO_CARRIER' as const;
export const DEMO_CARRIER_VERSION = 'demo-distance-v1' as const;
export const DEMO_CARRIER_SNAPSHOT_VERSION = 'vn-legacy-63-696-v1' as const;
export const DEMO_CARRIER_CURRENCY = 'VND' as const;
export const DEMO_CARRIER_ROAD_FACTOR = 1.25 as const;
export const DEMO_CARRIER_MIN_DISTANCE_KM = 3;
export const DEMO_CARRIER_MAX_DISTANCE_KM = 2_000;
export const DEMO_CARRIER_MAX_BODY_BYTES = 64 * 1024;
export const DEMO_CARRIER_CALLBACK_WINDOW_SECONDS = 5 * 60;

export const DEMO_CARRIER_SERVICES = ['ECONOMY', 'STANDARD', 'EXPRESS'] as const;
export type DemoCarrierServiceCode = (typeof DEMO_CARRIER_SERVICES)[number];

export const DEMO_CARRIER_SHIPMENT_STATES = [
  'REGISTRATION_PENDING',
  'REGISTRATION_FAILED',
  'CREATED',
  'ACCEPTED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERY_FAILED',
  'RETURN_IN_TRANSIT',
  'DELIVERED',
  'RETURNED',
] as const;
export type DemoCarrierShipmentState = (typeof DEMO_CARRIER_SHIPMENT_STATES)[number];

export const DEMO_CARRIER_OPERATION_ACTIONS = [
  'ADVANCE',
  'FAIL_DELIVERY',
  'RETRY_DELIVERY',
  'START_RETURN',
  'ADVANCE_RETURN',
  'RETRY_REGISTRATION',
] as const;
export type DemoCarrierOperationAction = (typeof DEMO_CARRIER_OPERATION_ACTIONS)[number];

export const DEMO_CARRIER_FAILURE_REASONS = [
  'RECIPIENT_UNREACHABLE',
  'RECIPIENT_RESCHEDULED',
  'ADDRESS_UNCLEAR',
  'RECIPIENT_REFUSED',
  'OTHER',
] as const;
export type DemoCarrierFailureReason = (typeof DEMO_CARRIER_FAILURE_REASONS)[number];

export const DEMO_CARRIER_CALLBACK_OUTCOMES = [
  'APPLIED',
  'DUPLICATE',
  'STALE',
  'CONFLICT',
  'REJECTED',
] as const;
export type DemoCarrierCallbackOutcome = (typeof DEMO_CARRIER_CALLBACK_OUTCOMES)[number];

export type DemoCarrierResolutionLevel = 'DISTRICT';

export interface DemoCarrierLocationIdentity {
  provinceCode: string;
  districtCode: string;
  provinceName: string;
  districtName: string;
  resolutionLevel: DemoCarrierResolutionLevel;
}

export interface DemoCarrierQuoteRequest {
  calculationVersion: typeof DEMO_CARRIER_VERSION;
  locationSnapshotVersion: typeof DEMO_CARRIER_SNAPSHOT_VERSION;
  shipmentReference: string;
  pickup: { provinceCode: string; districtCode: string };
  delivery: { provinceCode: string; districtCode: string };
  shipmentWeightGrams: number;
  service?: DemoCarrierServiceCode;
}

export interface DemoCarrierQuote {
  provider: typeof DEMO_CARRIER_PROVIDER;
  version: typeof DEMO_CARRIER_VERSION;
  simulation: true;
  shipmentReference: string;
  pickup: DemoCarrierLocationIdentity;
  delivery: DemoCarrierLocationIdentity;
  straightLineDistanceKm: number;
  estimatedDistanceKm: number;
  billableDistanceKm: number;
  shipmentWeightGrams: number;
  service: DemoCarrierServiceCode;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  baseFeeMinor: number;
  nearDistanceFeeMinor: number;
  longDistanceFeeMinor: number;
  weightFeeMinor: number;
  totalFeeMinor: number;
  currency: typeof DEMO_CARRIER_CURRENCY;
  calculationVersion: typeof DEMO_CARRIER_VERSION;
  locationSnapshotVersion: typeof DEMO_CARRIER_SNAPSHOT_VERSION;
  calculatedAt: string;
}

export interface DemoCarrierRegistrationRequest {
  provider: typeof DEMO_CARRIER_PROVIDER;
  version: typeof DEMO_CARRIER_VERSION;
  shipmentReference: string;
  trackingCode: string;
  service: DemoCarrierServiceCode;
  shipmentWeightGrams: number;
  pickup: { provinceCode: string; districtCode: string };
  delivery: { provinceCode: string; districtCode: string };
  quote: DemoCarrierQuote;
}

export interface DemoCarrierContact {
  name: string;
  phoneNumber: string | null;
  address: string;
}

export interface DemoCarrierOrderItem {
  productName: string;
  variantName: string;
  quantity: number;
  shipmentWeightGrams: number;
  imageUrl: string | null;
  description: string | null;
}

export interface DemoCarrierOrderDetails {
  shopName: string;
  currency: string;
  createdAt: string;
  note: string | null;
  codAmountMinor: number;
  items: DemoCarrierOrderItem[];
}

export interface DemoCarrierDriver {
  name: string;
  phoneNumber: string | null;
  vehicle: string | null;
}

export interface DemoCarrierShipment {
  provider: typeof DEMO_CARRIER_PROVIDER;
  version: typeof DEMO_CARRIER_VERSION;
  simulation: true;
  shipmentReference: string;
  trackingCode: string;
  externalShipmentId: string;
  status: DemoCarrierShipmentState;
  service: DemoCarrierServiceCode;
  quote: DemoCarrierQuote;
  versionNumber: number;
  registeredAt: string;
  lastUpdatedAt: string;
  deliveredAt: string | null;
  returnedAt: string | null;
  events: DemoCarrierTrackingEvent[];
  /** Marketplace-owned data. The standalone carrier simulator may omit it. */
  sender?: DemoCarrierContact;
  recipient?: DemoCarrierContact;
  order?: DemoCarrierOrderDetails;
  driver?: DemoCarrierDriver | null;
}

export interface DemoCarrierTrackingEvent {
  externalEventId: string;
  shipmentReference: string;
  previousStatus: DemoCarrierShipmentState | null;
  status: DemoCarrierShipmentState;
  versionNumber: number;
  reason: DemoCarrierFailureReason | null;
  note: string | null;
  occurredAt: string;
}

export interface DemoCarrierCallbackPayload {
  externalEventId: string;
  externalShipmentId: string;
  shipmentReference: string;
  status: DemoCarrierShipmentState;
  versionNumber: number;
  occurredAt: string;
  reason?: DemoCarrierFailureReason;
  note?: string;
}

export interface DemoCarrierCallbackAcknowledgement {
  provider: typeof DEMO_CARRIER_PROVIDER;
  externalEventId: string;
  outcome: DemoCarrierCallbackOutcome;
  status: DemoCarrierShipmentState | null;
  versionNumber: number | null;
  receivedAt: string;
}

export interface DemoCarrierOperationRequest {
  action: DemoCarrierOperationAction;
  reason?: DemoCarrierFailureReason;
  note?: string;
}

export interface DemoCarrierOperationResponse {
  shipment: DemoCarrierShipment;
  callback: DemoCarrierCallbackAcknowledgement;
}

export interface DemoCarrierShipmentListQuery {
  reference?: string;
  status?: DemoCarrierShipmentState;
  service?: DemoCarrierServiceCode;
  from?: string;
  to?: string;
  limit: number;
  cursor?: string;
}

export interface DemoCarrierShipmentListResponse {
  provider: typeof DEMO_CARRIER_PROVIDER;
  simulation: true;
  items: DemoCarrierShipment[];
  page: { limit: number; nextCursor: string | null };
}

export interface DemoCarrierDashboardResponse {
  provider: typeof DEMO_CARRIER_PROVIDER;
  simulation: true;
  counts: Record<DemoCarrierShipmentState, number>;
  attention: DemoCarrierShipment[];
}

export interface DemoCarrierProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  invalidParameters?: string[];
  code?: string;
}

export const DEMO_CARRIER_STATE_LABELS: Record<DemoCarrierShipmentState, string> = {
  REGISTRATION_PENDING: 'Đang chờ đăng ký',
  REGISTRATION_FAILED: 'Đăng ký thất bại',
  CREATED: 'Đã tạo vận đơn',
  ACCEPTED: 'Đã tiếp nhận',
  IN_TRANSIT: 'Đang vận chuyển',
  OUT_FOR_DELIVERY: 'Đang giao hàng',
  DELIVERY_FAILED: 'Giao hàng chưa thành công',
  RETURN_IN_TRANSIT: 'Đang hoàn về shop',
  DELIVERED: 'Đã giao hàng',
  RETURNED: 'Đã hoàn về shop',
};

export const DEMO_CARRIER_SERVICE_LABELS: Record<DemoCarrierServiceCode, string> = {
  ECONOMY: 'Tiết kiệm',
  STANDARD: 'Tiêu chuẩn',
  EXPRESS: 'Nhanh',
};

export const DEMO_CARRIER_TARIFFS: Record<
  DemoCarrierServiceCode,
  {
    baseFeeMinor: number;
    nearDistanceBlockMinor: number;
    longDistanceBlockMinor: number;
    weightBlockMinor: number;
    estimatedDaysMin: number;
    estimatedDaysMax: number;
  }
> = {
  ECONOMY: {
    baseFeeMinor: 15_000,
    nearDistanceBlockMinor: 2_000,
    longDistanceBlockMinor: 4_000,
    weightBlockMinor: 2_000,
    estimatedDaysMin: 4,
    estimatedDaysMax: 6,
  },
  STANDARD: {
    baseFeeMinor: 22_000,
    nearDistanceBlockMinor: 3_000,
    longDistanceBlockMinor: 6_000,
    weightBlockMinor: 3_000,
    estimatedDaysMin: 2,
    estimatedDaysMax: 4,
  },
  EXPRESS: {
    baseFeeMinor: 35_000,
    nearDistanceBlockMinor: 4_000,
    longDistanceBlockMinor: 8_000,
    weightBlockMinor: 4_000,
    estimatedDaysMin: 1,
    estimatedDaysMax: 2,
  },
};

export interface DemoCarrierLocationSnapshotItem {
  provinceCode: string;
  provinceName: string;
  districtCode: string;
  districtName: string;
  aliases: string[];
  latitude: number;
  longitude: number;
}

function locationHash(value: string): number {
  let result = 2_166_136_261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16_777_619) >>> 0;
  return result;
}

/** A deterministic, committed-at-runtime snapshot: 63 provinces and 696 district points. */
export const DEMO_CARRIER_LOCATION_SNAPSHOT: readonly DemoCarrierLocationSnapshotItem[] =
  LEGACY_VIETNAM_PROVINCE_REGIONS.flatMap((province, provinceIndex) => {
    const districtCount = provinceIndex < 3 ? 12 : 11;
    return Array.from({ length: districtCount }, (_, districtIndex) => {
      const districtNumber = String(districtIndex + 1).padStart(3, '0');
      const districtCode = `${province.code}-${districtNumber}`;
      const seed = locationHash(districtCode);
      return {
        provinceCode: province.code,
        provinceName: province.name,
        districtCode,
        districtName: `Khu vực ${province.code}-${districtNumber}`,
        aliases: [normalizeVietnameseAdministrativeName(`Khu vực ${province.code}-${districtNumber}`), districtCode.toLowerCase()],
        latitude: 8 + ((seed % 1_300) / 100),
        longitude: 102 + (((seed >>> 8) % 800) / 100),
      };
    });
  });

export const DEMO_CARRIER_LOCATION_SNAPSHOT_DIGEST = (() => {
  const serialized = DEMO_CARRIER_LOCATION_SNAPSHOT.map((item) =>
    [item.provinceCode, item.districtCode, item.latitude.toFixed(4), item.longitude.toFixed(4)].join('|'),
  ).join(';');
  return locationHash(serialized).toString(16).padStart(8, '0');
})();

const stateSet = new Set<string>(DEMO_CARRIER_SHIPMENT_STATES);
const serviceSet = new Set<string>(DEMO_CARRIER_SERVICES);
const actionSet = new Set<string>(DEMO_CARRIER_OPERATION_ACTIONS);
const reasonSet = new Set<string>(DEMO_CARRIER_FAILURE_REASONS);
const outcomeSet = new Set<string>(DEMO_CARRIER_CALLBACK_OUTCOMES);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const hasExactKeys = (value: Record<string, unknown>, required: string[], optional: string[] = []) => {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.has(key));
};
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isInstant = (value: unknown): value is string =>
  isText(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const isSafeNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isLocationIdentity = (value: unknown): value is DemoCarrierLocationIdentity =>
  isRecord(value) &&
  hasExactKeys(value, ['provinceCode', 'districtCode', 'provinceName', 'districtName', 'resolutionLevel']) &&
  isText(value.provinceCode) &&
  isText(value.districtCode) &&
  isText(value.provinceName) &&
  isText(value.districtName) &&
  value.resolutionLevel === 'DISTRICT';

export const isDemoCarrierServiceCode = (value: unknown): value is DemoCarrierServiceCode =>
  typeof value === 'string' && serviceSet.has(value);

export const isDemoCarrierShipmentState = (value: unknown): value is DemoCarrierShipmentState =>
  typeof value === 'string' && stateSet.has(value);

export const isDemoCarrierOperationAction = (value: unknown): value is DemoCarrierOperationAction =>
  typeof value === 'string' && actionSet.has(value);

export const isDemoCarrierFailureReason = (value: unknown): value is DemoCarrierFailureReason =>
  typeof value === 'string' && reasonSet.has(value);

export const isDemoCarrierCallbackOutcome = (value: unknown): value is DemoCarrierCallbackOutcome =>
  typeof value === 'string' && outcomeSet.has(value);

export function isDemoCarrierQuote(value: unknown): value is DemoCarrierQuote {
  if (!isRecord(value)) return false;
  return (
    hasExactKeys(value, [
      'provider', 'version', 'simulation', 'shipmentReference', 'pickup', 'delivery',
      'straightLineDistanceKm', 'estimatedDistanceKm', 'billableDistanceKm', 'shipmentWeightGrams',
      'service', 'estimatedDaysMin', 'estimatedDaysMax', 'baseFeeMinor', 'nearDistanceFeeMinor',
      'longDistanceFeeMinor', 'weightFeeMinor', 'totalFeeMinor', 'currency', 'calculationVersion',
      'locationSnapshotVersion', 'calculatedAt',
    ]) &&
    value.provider === DEMO_CARRIER_PROVIDER &&
    value.version === DEMO_CARRIER_VERSION &&
    value.simulation === true &&
    isText(value.shipmentReference) &&
    isLocationIdentity(value.pickup) &&
    isLocationIdentity(value.delivery) &&
    isSafeNonNegativeInteger(value.straightLineDistanceKm) &&
    isSafeNonNegativeInteger(value.estimatedDistanceKm) &&
    isSafeNonNegativeInteger(value.billableDistanceKm) &&
    isSafeNonNegativeInteger(value.shipmentWeightGrams) &&
    isDemoCarrierServiceCode(value.service) &&
    isSafeNonNegativeInteger(value.baseFeeMinor) &&
    isSafeNonNegativeInteger(value.nearDistanceFeeMinor) &&
    isSafeNonNegativeInteger(value.longDistanceFeeMinor) &&
    isSafeNonNegativeInteger(value.weightFeeMinor) &&
    isSafeNonNegativeInteger(value.totalFeeMinor) &&
    value.currency === DEMO_CARRIER_CURRENCY &&
    value.calculationVersion === DEMO_CARRIER_VERSION &&
    value.locationSnapshotVersion === DEMO_CARRIER_SNAPSHOT_VERSION &&
    isInstant(value.calculatedAt)
  );
}

export function isDemoCarrierCallbackPayload(value: unknown): value is DemoCarrierCallbackPayload {
  if (!isRecord(value)) return false;
  return (
    hasExactKeys(value, ['externalEventId', 'externalShipmentId', 'shipmentReference', 'status', 'versionNumber', 'occurredAt'], ['reason', 'note']) &&
    isText(value.externalEventId) &&
    isText(value.externalShipmentId) &&
    isText(value.shipmentReference) &&
    isDemoCarrierShipmentState(value.status) &&
    isSafeNonNegativeInteger(value.versionNumber) &&
    isInstant(value.occurredAt) &&
    (value.reason === undefined || isDemoCarrierFailureReason(value.reason)) &&
    (value.note === undefined || typeof value.note === 'string')
  );
}

export function isDemoCarrierOperationRequest(value: unknown): value is DemoCarrierOperationRequest {
  if (!isRecord(value)) return false;
  return (
    hasExactKeys(value, ['action'], ['reason', 'note']) &&
    isDemoCarrierOperationAction(value.action) &&
    (value.reason === undefined || isDemoCarrierFailureReason(value.reason)) &&
    (value.note === undefined || (typeof value.note === 'string' && value.note.length <= 500))
  );
}

export function isDemoCarrierCallbackAcknowledgement(
  value: unknown,
): value is DemoCarrierCallbackAcknowledgement {
  if (!isRecord(value)) return false;
  return (
    value.provider === DEMO_CARRIER_PROVIDER &&
    isText(value.externalEventId) &&
    isDemoCarrierCallbackOutcome(value.outcome) &&
    (value.status === null || isDemoCarrierShipmentState(value.status)) &&
    (value.versionNumber === null || isSafeNonNegativeInteger(value.versionNumber)) &&
    isInstant(value.receivedAt)
  );
}

export function isDemoCarrierProblemDetails(value: unknown): value is DemoCarrierProblemDetails {
  if (!isRecord(value)) return false;
  return (
    isText(value.type) &&
    isText(value.title) &&
    typeof value.status === 'number' &&
    isText(value.detail) &&
    (value.invalidParameters === undefined ||
      (Array.isArray(value.invalidParameters) && value.invalidParameters.every(isText))) &&
    (value.code === undefined || isText(value.code))
  );
}

export function demoCarrierActionAllowed(
  state: DemoCarrierShipmentState,
  action: DemoCarrierOperationAction,
): boolean {
  if (action === 'RETRY_REGISTRATION') return state === 'REGISTRATION_FAILED';
  if (action === 'ADVANCE')
    return state === 'CREATED' || state === 'ACCEPTED' || state === 'IN_TRANSIT' || state === 'OUT_FOR_DELIVERY';
  if (action === 'FAIL_DELIVERY') return state === 'OUT_FOR_DELIVERY';
  if (action === 'RETRY_DELIVERY') return state === 'DELIVERY_FAILED';
  if (action === 'START_RETURN') return state === 'DELIVERY_FAILED';
  if (action === 'ADVANCE_RETURN') return state === 'RETURN_IN_TRANSIT';
  return false;
}

export function demoCarrierNextState(
  state: DemoCarrierShipmentState,
  action: DemoCarrierOperationAction,
): DemoCarrierShipmentState | null {
  if (action === 'RETRY_REGISTRATION' && state === 'REGISTRATION_FAILED') return 'REGISTRATION_PENDING';
  if (action === 'ADVANCE' && state === 'CREATED') return 'OUT_FOR_DELIVERY';
  if (action === 'ADVANCE' && state === 'ACCEPTED') return 'IN_TRANSIT';
  if (action === 'ADVANCE' && state === 'IN_TRANSIT') return 'OUT_FOR_DELIVERY';
  if (action === 'ADVANCE' && state === 'OUT_FOR_DELIVERY') return 'DELIVERED';
  if (action === 'FAIL_DELIVERY' && state === 'OUT_FOR_DELIVERY') return 'DELIVERY_FAILED';
  if (action === 'RETRY_DELIVERY' && state === 'DELIVERY_FAILED') return 'OUT_FOR_DELIVERY';
  if (action === 'START_RETURN' && state === 'DELIVERY_FAILED') return 'RETURN_IN_TRANSIT';
  if (action === 'ADVANCE_RETURN' && state === 'RETURN_IN_TRANSIT') return 'RETURNED';
  return null;
}
