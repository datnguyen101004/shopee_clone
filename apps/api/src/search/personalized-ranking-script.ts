import { PERSONALIZED_RANKING_SCRIPT_VERSION } from './search.versions';
import { CAMPAIGN_RANKING_BOOST_MAX } from '../marketplace-campaigns/campaign-policy';

/** Stable id used by every personalized relevance request. */
export const PERSONALIZED_RANKING_SCRIPT_ID = `product-personalized-ranking-v${PERSONALIZED_RANKING_SCRIPT_VERSION}`;

/**
 * One versioned script is shared by search and recommendations. It receives
 * bounded profile/model maps and reads product features from doc values.
 */
export const PERSONALIZED_RANKING_SCRIPT_SOURCE = `
double finite(double value) {
  if (value != value || value == Double.POSITIVE_INFINITY || value == Double.NEGATIVE_INFINITY) return 0.0;
  return value;
}
double clamp(double value, double minimum, double maximum) {
  return Math.max(minimum, Math.min(maximum, finite(value)));
}
double affinity(Map values, String key) {
  if (key == null || key.length() == 0 || values == null || !values.containsKey(key)) return 0.0;
  return clamp(((Number) values[key]).doubleValue(), 0.0, 1.0);
}
double freshness(long nowMillis, long createdMillis) {
  double ageDays = Math.max(0.0, (nowMillis - createdMillis) / 86400000.0);
  return clamp(Math.exp(-ageDays / 30.0), 0.0, 1.0);
}

Map profile = params.profile;
double price = doc['effective_price_minor'].size() == 0 ? 0.0 : Math.max(0.0, finite((double) doc['effective_price_minor'].value));
double preferredMean = Math.max(0.0, finite(((Number) profile.preferredPriceMeanMinor).doubleValue()));
double priceDistance = preferredMean <= 0.0 ? 0.0 : Math.abs(price - preferredMean) / Math.max(preferredMean, 1.0);
double lexical = finite(_score);
double z = finite(params.intercept);
String categoryId = doc['category_id'].size() == 0 ? '' : doc['category_id'].value;
String shopId = doc['shop_id'].size() == 0 ? '' : doc['shop_id'].value;
double ratingAverage = doc['rating_average_basis_points'].size() == 0 ? 0.0 : finite((double) doc['rating_average_basis_points'].value);
double ratingCount = doc['rating_count'].size() == 0 ? 0.0 : finite((double) doc['rating_count'].value);
double soldCount = doc['sold_count'].size() == 0 ? 0.0 : finite((double) doc['sold_count'].value);
double inventoryAvailable = doc['inventory_available'].size() == 0 ? 0.0 : finite((double) doc['inventory_available'].value);
boolean promotionActive = doc['promotion_active'].size() > 0 && doc['promotion_active'].value;
boolean campaignEligible = doc['campaign_eligible'].size() > 0 && doc['campaign_eligible'].value;
long campaignStart = doc['campaign_active_from'].size() == 0 ? 0L : doc['campaign_active_from'].value.toInstant().toEpochMilli();
long campaignEnd = doc['campaign_active_until'].size() == 0 ? 0L : doc['campaign_active_until'].value.toInstant().toEpochMilli();
boolean campaignWindowOpen = campaignEligible && campaignStart <= (long) params.nowMillis && campaignEnd > (long) params.nowMillis;
double campaignRank = campaignWindowOpen && doc['campaign_rank'].size() > 0 ? clamp((double) doc['campaign_rank'].value, 0.0, 2.0) : 0.0;
double[] features = new double[] {
  affinity(profile.categoryAffinities, categoryId),
  affinity(profile.shopAffinities, shopId),
  clamp(((Number) profile.viewCount30d).doubleValue() / 500.0, 0.0, 1.0),
  clamp(((Number) profile.favoriteCount90d).doubleValue() / 500.0, 0.0, 1.0),
  clamp(((Number) profile.followedShopCount).doubleValue() / 100.0, 0.0, 1.0),
  clamp(((Number) profile.orderCount90d).doubleValue() / 100.0, 0.0, 1.0),
  clamp(1.0 - priceDistance, 0.0, 1.0),
  preferredMean <= 0.0 ? 0.0 : (price >= ((Number) profile.preferredPriceMinMinor).doubleValue() && price <= ((Number) profile.preferredPriceMaxMinor).doubleValue() ? 1.0 : 0.0),
  clamp(ratingAverage / 500.0, 0.0, 1.0),
  clamp(ratingCount / 1000.0, 0.0, 1.0),
  clamp(Math.log(1.0 + Math.max(0.0, soldCount)) / 12.0, 0.0, 1.0),
  promotionActive ? 1.0 : 0.0,
  freshness((long) params.nowMillis, doc['product_created_at'].size() == 0 ? (long) params.nowMillis : doc['product_created_at'].value.toInstant().toEpochMilli()),
  clamp(lexical / (1.0 + Math.abs(lexical)), 0.0, 1.0),
  inventoryAvailable > 0.0 ? 1.0 : 0.0,
  clamp(((Number) profile.eligibilityScore).doubleValue() / 100.0, 0.0, 1.0)
};
def weights = params.weights;
for (int i = 0; i < weights.size() && i < features.length; i++) {
  z += finite(((Number) weights[i]).doubleValue()) * features[i];
}
z = clamp(z, -60.0, 60.0);
// A bounded campaign tier is applied after the learned personal score.
// NORMAL (1) stays below FEATURED (2), and the total contribution is capped.
z += (campaignRank / 2.0) * ${CAMPAIGN_RANKING_BOOST_MAX};
double probability = z >= 0.0 ? 1.0 / (1.0 + Math.exp(-z)) : Math.exp(z) / (1.0 + Math.exp(z));
double score = finite(probability) * 1000000.0 + clamp(lexical, 0.0, 1000000.0) * 0.001;
return score != score || score < 0.0 || score == Double.POSITIVE_INFINITY || score == Double.NEGATIVE_INFINITY ? 0.0 : score;
`.trim();

export const PERSONALIZED_RANKING_SCRIPT = Object.freeze({
  id: PERSONALIZED_RANKING_SCRIPT_ID,
  version: PERSONALIZED_RANKING_SCRIPT_VERSION,
  lang: 'painless' as const,
  source: PERSONALIZED_RANKING_SCRIPT_SOURCE,
});
