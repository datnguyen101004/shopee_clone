import type { LegacyWard } from './legacy-vietnam-administrative-divisions';

type WardSnapshot = Readonly<{
  LEGACY_WARDS_BY_DISTRICT: Readonly<Record<string, readonly LegacyWard[]>>;
}>;

let snapshotPromise: Promise<WardSnapshot> | null = null;

export function loadLegacyWardSnapshot(): Promise<WardSnapshot> {
  snapshotPromise ??= import('./legacy-vietnam-wards.generated');
  return snapshotPromise;
}

export async function loadLegacyWards(districtCode: string): Promise<readonly LegacyWard[]> {
  const snapshot = await loadLegacyWardSnapshot();
  return snapshot.LEGACY_WARDS_BY_DISTRICT[districtCode] ?? [];
}

export function resetLegacyWardSnapshotForTests(): void {
  snapshotPromise = null;
}
