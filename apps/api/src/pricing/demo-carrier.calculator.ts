import {
  DEMO_CARRIER_MAX_DISTANCE_KM,
  DEMO_CARRIER_MIN_DISTANCE_KM,
  DEMO_CARRIER_LOCATION_SNAPSHOT,
  DEMO_CARRIER_ROAD_FACTOR,
  DEMO_CARRIER_SERVICES,
  DEMO_CARRIER_SNAPSHOT_VERSION,
  DEMO_CARRIER_TARIFFS,
  DEMO_CARRIER_VERSION,
  normalizeVietnameseAdministrativeName,
  resolveLegacyVietnamProvince,
  LEGACY_VIETNAM_PROVINCE_REGIONS,
  type DemoCarrierLocationIdentity,
  type DemoCarrierQuote,
  type DemoCarrierQuoteRequest,
  type DemoCarrierServiceCode,
} from '@shopee-clone/contracts';
import { Injectable } from '@nestjs/common';

import { checkedAdd, checkedInteger, checkedMultiply } from './money';

type Point = { latitude: number; longitude: number };

const PROVINCE_ANCHORS: Record<string, Point> = {
  '01': { latitude: 21.0285, longitude: 105.8542 },
  '79': { latitude: 10.7769, longitude: 106.7009 },
  '31': { latitude: 20.8449, longitude: 106.6881 },
  '48': { latitude: 16.0544, longitude: 108.2022 },
  '92': { latitude: 10.0452, longitude: 105.7469 },
};

const KNOWN_DISTRICTS: Record<string, Array<{ code: string; name: string }>> = {
  '01': [
    { code: '001', name: 'Ba Đình' },
    { code: '002', name: 'Hoàn Kiếm' },
    { code: '003', name: 'Tây Hồ' },
    { code: '004', name: 'Long Biên' },
    { code: '005', name: 'Cầu Giấy' },
    { code: '006', name: 'Đống Đa' },
    { code: '007', name: 'Hai Bà Trưng' },
    { code: '008', name: 'Thanh Xuân' },
  ],
  '79': [
    { code: '001', name: 'Quận 1' },
    { code: '003', name: 'Quận 3' },
    { code: '005', name: 'Quận 5' },
    { code: '007', name: 'Quận 7' },
    { code: '012', name: 'Bình Thạnh' },
    { code: '013', name: 'Gò Vấp' },
    { code: '014', name: 'Tân Bình' },
  ],
};

function pointFor(provinceCode: string, districtCode: string): Point {
  const anchor = PROVINCE_ANCHORS[provinceCode] ?? {
    latitude: 8 + Number(provinceCode || 0) / 3,
    longitude: 102 + Number(provinceCode || 0) / 10,
  };
  const seed = [...`${provinceCode}:${districtCode}`].reduce(
    (total, character) => (total * 31 + character.charCodeAt(0)) % 10_000,
    0,
  );
  // Keep generated points close to the province anchor and stable across runs.
  const latitudeOffset = ((seed % 101) - 50) / 1_000;
  const longitudeOffset = ((Math.floor(seed / 101) % 101) - 50) / 1_000;
  return { latitude: anchor.latitude + latitudeOffset, longitude: anchor.longitude + longitudeOffset };
}

function haversineKm(from: Point, to: Point): number {
  const earthRadiusKm = 6_371;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function locationFor(province: string, district: string): DemoCarrierLocationIdentity {
  const resolvedProvince =
    LEGACY_VIETNAM_PROVINCE_REGIONS.find((candidate) => candidate.code === province) ??
    resolveLegacyVietnamProvince(province);
  if (!resolvedProvince) throw new Error('UNRESOLVED_PROVINCE');
  const normalizedDistrict = normalizeVietnameseAdministrativeName(district);
  if (!normalizedDistrict) throw new Error('UNRESOLVED_DISTRICT');
  const directCode = /^\d{2}[-_]\d{3}$/.test(district.trim())
    ? district.trim().replace('_', '-')
    : null;
  const snapshotPoint = directCode
    ? DEMO_CARRIER_LOCATION_SNAPSHOT.find((item) => item.provinceCode === resolvedProvince.code && item.districtCode === directCode)
    : null;
  if (snapshotPoint) {
    return {
      provinceCode: resolvedProvince.code,
      provinceName: resolvedProvince.name,
      districtCode: snapshotPoint.districtCode,
      districtName: snapshotPoint.districtName,
      resolutionLevel: 'DISTRICT',
    };
  }
  const districtOptions = KNOWN_DISTRICTS[resolvedProvince.code] ?? [];
  const exact = districtOptions.find(
    (candidate) => normalizeVietnameseAdministrativeName(candidate.name) === normalizedDistrict,
  );
  const provincePoints = DEMO_CARRIER_LOCATION_SNAPSHOT.filter((item) => item.provinceCode === resolvedProvince.code);
  const generatedIndex = provincePoints.length > 0 ? Math.abs(hash(normalizedDistrict)) % provincePoints.length : 0;
  const districtCode = exact
    ? `${resolvedProvince.code}-${exact.code.padStart(3, '0')}`
    : provincePoints[generatedIndex]?.districtCode ?? `${resolvedProvince.code}-001`;
  const districtName = exact?.name ?? provincePoints[generatedIndex]?.districtName ?? district.trim();
  return {
    provinceCode: resolvedProvince.code,
    provinceName: resolvedProvince.name,
    districtCode,
    districtName,
    resolutionLevel: 'DISTRICT',
  };
}

function hash(value: string): number {
  let result = 0;
  for (const character of value) result = (result * 33 + character.charCodeAt(0)) | 0;
  return result;
}

function ceilBlocks(value: number, block: number): number {
  if (value <= 0) return 0;
  return Math.ceil(value / block);
}

export interface DemoCarrierCalculationInput {
  shipmentReference: string;
  originProvince: string;
  originDistrict?: string | null;
  destinationProvince: string;
  destinationDistrict: string;
  shipmentWeightGrams: number;
  service?: DemoCarrierServiceCode;
  calculatedAt?: Date;
}

@Injectable()
export class DemoCarrierCalculator {
  calculate(input: DemoCarrierCalculationInput): DemoCarrierQuote {
    const weight = checkedInteger(input.shipmentWeightGrams);
    if (weight < 1) throw new Error('INVALID_WEIGHT');
    const service = input.service ?? 'STANDARD';
    if (!DEMO_CARRIER_SERVICES.includes(service)) throw new Error('UNSUPPORTED_SERVICE');
    if (!input.originDistrict?.trim()) throw new Error('MISSING_PICKUP_DISTRICT');
    const pickup = locationFor(input.originProvince, input.originDistrict);
    const delivery = locationFor(input.destinationProvince, input.destinationDistrict);
    const straightLineDistanceKm = haversineKm(
      pointFor(pickup.provinceCode, pickup.districtCode),
      pointFor(delivery.provinceCode, delivery.districtCode),
    );
    const estimatedDistanceKm = Math.max(
      DEMO_CARRIER_MIN_DISTANCE_KM,
      Math.ceil(straightLineDistanceKm * DEMO_CARRIER_ROAD_FACTOR),
    );
    const billableDistanceKm = estimatedDistanceKm;
    if (billableDistanceKm > DEMO_CARRIER_MAX_DISTANCE_KM) throw new Error('DISTANCE_UNSUPPORTED');
    const tariff = DEMO_CARRIER_TARIFFS[service];
    const nearBlocks = ceilBlocks(Math.min(Math.max(0, billableDistanceKm - 5), 45), 5);
    const longBlocks = ceilBlocks(Math.max(0, billableDistanceKm - 50), 100);
    const weightBlocks = ceilBlocks(Math.max(0, weight - 500), 500);
    const nearDistanceFeeMinor = checkedMultiply(nearBlocks, tariff.nearDistanceBlockMinor);
    const longDistanceFeeMinor = checkedMultiply(longBlocks, tariff.longDistanceBlockMinor);
    const weightFeeMinor = checkedMultiply(weightBlocks, tariff.weightBlockMinor);
    const totalFeeMinor = checkedAdd(
      tariff.baseFeeMinor,
      nearDistanceFeeMinor,
      longDistanceFeeMinor,
      weightFeeMinor,
    );
    return {
      provider: 'DEMO_CARRIER',
      version: DEMO_CARRIER_VERSION,
      simulation: true,
      shipmentReference: input.shipmentReference,
      pickup,
      delivery,
      straightLineDistanceKm: Math.round(straightLineDistanceKm * 100) / 100,
      estimatedDistanceKm,
      billableDistanceKm,
      shipmentWeightGrams: weight,
      service,
      estimatedDaysMin: tariff.estimatedDaysMin,
      estimatedDaysMax: tariff.estimatedDaysMax,
      baseFeeMinor: tariff.baseFeeMinor,
      nearDistanceFeeMinor,
      longDistanceFeeMinor,
      weightFeeMinor,
      totalFeeMinor,
      currency: 'VND',
      calculationVersion: DEMO_CARRIER_VERSION,
      locationSnapshotVersion: DEMO_CARRIER_SNAPSHOT_VERSION,
      calculatedAt: (input.calculatedAt ?? new Date()).toISOString(),
    };
  }

  fromRequest(request: DemoCarrierQuoteRequest): DemoCarrierQuote {
    return this.calculate({
      shipmentReference: request.shipmentReference,
      originProvince: request.pickup.provinceCode,
      originDistrict: request.pickup.districtCode,
      destinationProvince: request.delivery.provinceCode,
      destinationDistrict: request.delivery.districtCode,
      shipmentWeightGrams: request.shipmentWeightGrams,
      service: request.service,
    });
  }
}
