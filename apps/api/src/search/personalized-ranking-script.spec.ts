import {
  PERSONALIZED_RANKING_SCRIPT,
  PERSONALIZED_RANKING_SCRIPT_ID,
  PERSONALIZED_RANKING_SCRIPT_SOURCE,
} from './personalized-ranking-script';

describe('personalized ranking stored script', () => {
  it('is a single versioned painless script with bounded logistic output', () => {
    expect(PERSONALIZED_RANKING_SCRIPT.id).toBe(PERSONALIZED_RANKING_SCRIPT_ID);
    expect(PERSONALIZED_RANKING_SCRIPT.lang).toBe('painless');
    expect(PERSONALIZED_RANKING_SCRIPT_SOURCE).toContain('double probability');
    expect(PERSONALIZED_RANKING_SCRIPT_SOURCE).toContain('Math.exp(-z)');
    expect(PERSONALIZED_RANKING_SCRIPT_SOURCE).toContain('z = clamp(z, -60.0, 60.0)');
    expect(PERSONALIZED_RANKING_SCRIPT_SOURCE).toContain('score < 0.0');
    expect(PERSONALIZED_RANKING_SCRIPT_SOURCE).toContain("doc['category_id']");
    expect(PERSONALIZED_RANKING_SCRIPT_SOURCE).toContain("doc['shop_id']");
  });
});
