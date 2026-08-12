export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type DatasetSourceKey =
  'bachhoa' | 'dienthoai' | 'mypham' | 'noithat' | 'thethao' | 'thoitrang';

export interface DatasetManifestEntry {
  key: DatasetSourceKey;
  fileName: string;
  expectedCount: number;
  category: {
    slug: string;
    name: string;
    iconKey: string;
    sortOrder: number;
  };
  shop: {
    slug: string;
    name: string;
    location: string;
  };
}

export interface RawDatasetRecord {
  [key: string]: JsonValue | undefined;
  id?: JsonValue;
  product_id?: JsonValue;
  name?: JsonValue;
  price?: JsonValue;
  rating?: JsonValue;
  notes?: JsonValue;
  image_url?: JsonValue;
  product_url?: JsonValue;
  source_page?: JsonValue;
}

export interface LoadedDatasetSource {
  manifest: DatasetManifestEntry;
  checksum: string;
  sourceUrl: string;
  rootMetadata: JsonObject;
  records: RawDatasetRecord[];
}

export interface GeneratedFieldMetadata extends JsonObject {
  field: string;
  policyVersion: string;
  method: string;
}

export interface NormalizedDatasetProduct {
  id: string;
  sourceRecordId: string;
  sourceId: string;
  sourceKey: DatasetSourceKey;
  stableRecordKey: string;
  sourceIdentity: string;
  sourceIndex: number;
  sourceProductUrl: string | null;
  sourcePageUrl: string | null;
  rawNotes: string | null;
  rawPayload: RawDatasetRecord;
  generatedFields: GeneratedFieldMetadata[];
  categoryId: string;
  shopId: string;
  slug: string;
  name: string;
  description: string;
  ratingAverageBasisPoints: number;
  ratingCount: number;
  soldCount: number;
  createdAt: Date;
  variant: {
    id: string;
    sku: string;
    name: string;
    priceMinor: bigint;
    compareAtPriceMinor: bigint | null;
    quantityOnHand: number;
    quantityReserved: number;
  };
  image: {
    id: string;
    url: string;
    altText: string;
  };
}

export interface NormalizedDatasetSource {
  id: string;
  key: DatasetSourceKey;
  fileName: string;
  sourceUrl: string;
  checksum: string;
  recordCount: number;
  rootMetadata: JsonObject;
  policyVersion: string;
  category: DatasetManifestEntry['category'] & { id: string };
  shop: DatasetManifestEntry['shop'] & { id: string; ownerId: string };
  owner: { id: string; email: string; displayName: string };
  products: NormalizedDatasetProduct[];
}

export interface CanonicalDatasetPlan {
  policyVersion: string;
  totalRecords: number;
  generatedPriceCount: number;
  generatedRatingCount: number;
  sources: NormalizedDatasetSource[];
}

export interface DatasetImportSummary {
  policyVersion: string;
  totalRecords: number;
  generatedPriceCount: number;
  generatedRatingCount: number;
  sources: Array<{
    key: DatasetSourceKey;
    category: string;
    recordCount: number;
    checksumPrefix: string;
  }>;
}
