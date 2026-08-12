export interface SearchableCatalogCandidate {
  name: string;
  description: string;
  shopName: string;
  categoryName: string;
}

export function normalizeDiscoveryText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/đ/gi, (character) => (character === 'Đ' ? 'D' : 'd'))
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function discoveryTokens(value: string): string[] {
  return [...new Set(normalizeDiscoveryText(value).split(' ').filter(Boolean))];
}

export function relevanceScore(
  candidate: SearchableCatalogCandidate,
  rawQuery: string,
): number | null {
  const tokens = discoveryTokens(rawQuery);
  if (!tokens.length) return 0;
  const name = normalizeDiscoveryText(candidate.name);
  const description = normalizeDiscoveryText(candidate.description);
  const shop = normalizeDiscoveryText(candidate.shopName);
  const category = normalizeDiscoveryText(candidate.categoryName);
  const nameWords = new Set(name.split(' '));
  const normalizedQuery = tokens.join(' ');
  let score = 0;
  let matched = false;

  if (name === normalizedQuery) score += 1_000;
  else if (name.startsWith(normalizedQuery)) score += 500;

  for (const token of tokens) {
    if (nameWords.has(token)) {
      score += 200;
      matched = true;
    } else if (name.includes(token)) {
      score += 100;
      matched = true;
    }
    if (category.includes(token)) {
      score += 50;
      matched = true;
    }
    if (shop.includes(token)) {
      score += 30;
      matched = true;
    }
    if (description.includes(token)) {
      score += 10;
      matched = true;
    }
  }

  return matched || name === normalizedQuery || name.startsWith(normalizedQuery) ? score : null;
}
