export interface SearchableCatalogCandidate {
  name: string;
  description: string;
  shopName: string;
  categoryName: string;
}

export interface SearchSuggestionCandidate {
  name: string;
  soldCount: number;
  createdAt: Date;
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

function editDistanceWithin(left: string, right: string, maximum: number): boolean {
  if (Math.abs(left.length - right.length) > maximum) return false;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    let minimum = row;
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      const value = Math.min(
        current[column - 1]! + 1,
        previous[column]! + 1,
        previous[column - 1]! + cost,
      );
      current[column] = value;
      minimum = Math.min(minimum, value);
    }
    if (minimum > maximum) return false;
    previous = current;
  }
  return previous[right.length]! <= maximum;
}

/** Returns true for exact, prefix, or bounded edit-distance token matches. */
export function discoveryTokenMatches(candidate: string, query: string): boolean {
  if (candidate === query || candidate.startsWith(query)) return true;
  if (query.length < 3) return false;
  const maximum = query.length <= 5 ? 1 : 2;
  return editDistanceWithin(candidate, query, maximum);
}

export function rankSearchSuggestions(
  candidates: SearchSuggestionCandidate[],
  rawQuery: string,
  limit: number,
): string[] {
  const tokens = discoveryTokens(rawQuery);
  if (!tokens.length) return [];
  const normalizedQuery = tokens.join(' ');
  const ranked = candidates.flatMap((candidate) => {
    const words = discoveryTokens(candidate.name);
    if (!tokens.every((token) => words.some((word) => discoveryTokenMatches(word, token)))) {
      return [];
    }
    let score = 0;
    const normalizedName = normalizeDiscoveryText(candidate.name);
    if (normalizedName === normalizedQuery) score += 1_000;
    else if (normalizedName.startsWith(normalizedQuery)) score += 500;
    for (const token of tokens) {
      const word = words.find((value) => discoveryTokenMatches(value, token));
      if (word === token) score += 200;
      else if (word?.startsWith(token)) score += 120;
      else score += 80;
    }
    return [{ ...candidate, score }];
  });
  ranked.sort((left, right) => {
    const score = right.score - left.score;
    if (score !== 0) return score;
    const sold = right.soldCount - left.soldCount;
    if (sold !== 0) return sold;
    const created = right.createdAt.getTime() - left.createdAt.getTime();
    if (created !== 0) return created;
    return left.name.localeCompare(right.name, 'vi');
  });
  const seen = new Set<string>();
  return ranked.flatMap((candidate) => {
    const key = normalizeDiscoveryText(candidate.name);
    if (seen.has(key)) return [];
    seen.add(key);
    return [candidate.name];
  }).slice(0, limit);
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
  let matchedTokens = 0;

  if (name === normalizedQuery) score += 1_000;
  else if (name.startsWith(normalizedQuery)) score += 500;

  for (const token of tokens) {
    let tokenMatched = false;
    if (nameWords.has(token)) {
      score += 200;
      tokenMatched = true;
    } else if (name.includes(token)) {
      score += 100;
      tokenMatched = true;
    } else if ([...nameWords].some((word) => discoveryTokenMatches(word, token))) {
      score += 80;
      tokenMatched = true;
    }
    if (category.includes(token)) {
      score += 50;
      tokenMatched = true;
    }
    if (shop.includes(token)) {
      score += 30;
      tokenMatched = true;
    }
    if (description.includes(token)) {
      score += 10;
      tokenMatched = true;
    }
    if (tokenMatched) matchedTokens += 1;
  }

  return matchedTokens === tokens.length || name === normalizedQuery || name.startsWith(normalizedQuery)
    ? score
    : null;
}
