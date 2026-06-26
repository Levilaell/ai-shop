import { describe, it, expect } from 'vitest';
import {
  scoreProduct,
  productionCostBrl,
  commissionBrl,
  normalizeCategory,
  DEFAULT_SCORE_CONFIG,
  type ScorableProduct,
  type ScoreConfig,
} from './score.js';

/** A high-quality kitchen gadget in the impulse band with healthy commission. */
const idealProduct: ScorableProduct = {
  title: 'Cortador de legumes multifuncional 8 em 1',
  price_brl: 79.9,
  commission_pct: 18,
  category: 'cozinha',
};

describe('normalizeCategory', () => {
  it('lowercases, strips accents, and collapses separators', () => {
    expect(normalizeCategory('Tech Acessórios')).toBe('tech_acessorios');
    expect(normalizeCategory('  Cozinha  ')).toBe('cozinha');
    expect(normalizeCategory('utilidades-domesticas')).toBe('utilidades_domesticas');
  });
  it('maps null/empty to empty string', () => {
    expect(normalizeCategory(null)).toBe('');
    expect(normalizeCategory(undefined)).toBe('');
    expect(normalizeCategory('   ')).toBe('');
  });
});

describe('economics helpers', () => {
  it('commissionBrl = price * pct / 100', () => {
    expect(commissionBrl(idealProduct)).toBeCloseTo(14.382, 3);
  });
  it('productionCostBrl uses the configured HeyGen cost * margin * FX', () => {
    // 1 min * $1/min * 5.5 BRL/USD * 2 margin = 11 BRL
    expect(productionCostBrl(DEFAULT_SCORE_CONFIG)).toBeCloseTo(11, 6);
  });
});

describe('scoreProduct — determinism & range', () => {
  it('is deterministic for the same input', () => {
    const a = scoreProduct(idealProduct);
    const b = scoreProduct(idealProduct);
    expect(a).toEqual(b);
  });
  it('produces a score within 0..100', () => {
    const { score } = scoreProduct(idealProduct);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });
  it('exposes a full auditable breakdown', () => {
    const { breakdown } = scoreProduct(idealProduct);
    expect(breakdown.demonstrability.reason).toMatch(/alta/);
    expect(breakdown.priceRange.reason).toMatch(/faixa de impulso/);
    expect(breakdown.economics.commissionBrl).toBeCloseTo(14.382, 3);
    expect(breakdown.economics.productionCostBrl).toBeCloseTo(11, 6);
    expect(breakdown.blocked).toBe(false);
  });
});

describe('scoreProduct — demonstrability dimension', () => {
  it('ranks high-demo > medium-demo > low-demo, all else equal', () => {
    const base = { price_brl: 79.9, commission_pct: 18, title: 'Produto X' };
    const high = scoreProduct({ ...base, category: 'cozinha' }).breakdown.demonstrability.raw;
    const medium = scoreProduct({ ...base, category: 'fitness' }).breakdown.demonstrability.raw;
    const low = scoreProduct({ ...base, category: 'moda' }).breakdown.demonstrability.raw;
    expect(high).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(low);
  });
  it('treats an unknown category as neutral (not blocked)', () => {
    const r = scoreProduct({ ...idealProduct, category: 'categoria_inexistente' });
    expect(r.breakdown.blocked).toBe(false);
    expect(r.breakdown.demonstrability.raw).toBeCloseTo(0.4, 6);
  });
});

describe('scoreProduct — price-range dimension', () => {
  it('scores 1.0 inside the impulse band', () => {
    expect(scoreProduct({ ...idealProduct, price_brl: 50 }).breakdown.priceRange.raw).toBe(1);
    expect(scoreProduct({ ...idealProduct, price_brl: 30 }).breakdown.priceRange.raw).toBe(1);
    expect(scoreProduct({ ...idealProduct, price_brl: 150 }).breakdown.priceRange.raw).toBe(1);
  });
  it('falls off below the ideal minimum', () => {
    const raw = scoreProduct({ ...idealProduct, price_brl: 20 }).breakdown.priceRange.raw;
    expect(raw).toBeGreaterThan(0);
    expect(raw).toBeLessThan(1);
  });
  it('falls off above the ideal maximum, reaching 0 at the hard cap', () => {
    expect(scoreProduct({ ...idealProduct, price_brl: 300 }).breakdown.priceRange.raw).toBe(0);
    expect(scoreProduct({ ...idealProduct, price_brl: 500 }).breakdown.priceRange.raw).toBe(0);
  });
});

describe('scoreProduct — commission-vs-cost dimension', () => {
  it('scores 0 when commission barely covers production cost', () => {
    // commission ~ R$11 == cost; coverage ~1x => raw 0
    const p: ScorableProduct = { title: 'X', price_brl: 11, commission_pct: 100, category: 'cozinha' };
    expect(scoreProduct(p).breakdown.commissionVsCost.raw).toBe(0);
  });
  it('scores 1 when commission comfortably exceeds the target coverage', () => {
    const p: ScorableProduct = { title: 'X', price_brl: 300, commission_pct: 30, category: 'cozinha' };
    // commission R$90 vs cost R$11 => ~8x >> target 4x
    expect(scoreProduct(p).breakdown.commissionVsCost.raw).toBe(1);
  });
  it('rises monotonically with commission', () => {
    const low = scoreProduct({ title: 'X', price_brl: 60, commission_pct: 10, category: 'cozinha' })
      .breakdown.commissionVsCost.raw;
    const high = scoreProduct({ title: 'X', price_brl: 60, commission_pct: 25, category: 'cozinha' })
      .breakdown.commissionVsCost.raw;
    expect(high).toBeGreaterThanOrEqual(low);
  });
});

describe('scoreProduct — claim safety & blocking', () => {
  it('blocks a supplement/health category outright (score 0)', () => {
    const p: ScorableProduct = {
      title: 'Whey protein concentrado',
      price_brl: 99,
      commission_pct: 30,
      category: 'suplemento',
    };
    const r = scoreProduct(p);
    expect(r.breakdown.blocked).toBe(true);
    expect(r.score).toBe(0);
    expect(r.breakdown.blockReasons.join(' ')).toMatch(/biológico|biologico/i);
  });
  it('blocks a prohibited claim in the title even for a non-blocked category', () => {
    const p: ScorableProduct = {
      title: 'Sérum facial clareador (uso contínuo)',
      price_brl: 89.9,
      commission_pct: 25,
      category: 'beleza',
    };
    const r = scoreProduct(p);
    expect(r.breakdown.blocked).toBe(true);
    expect(r.score).toBe(0);
    expect(r.breakdown.blockReasons.join(' ')).toMatch(/claim proibido/i);
  });
  it('penalizes (but does not block) a claim-risky beauty product with a clean title', () => {
    const p: ScorableProduct = {
      title: 'Pincel de maquiagem profissional',
      price_brl: 49.9,
      commission_pct: 20,
      category: 'maquiagem',
    };
    const r = scoreProduct(p);
    expect(r.breakdown.blocked).toBe(false);
    expect(r.breakdown.claimSafety.raw).toBeCloseTo(0.5, 6);
  });
  it('gives full claim-safety marks to a neutral product', () => {
    expect(scoreProduct(idealProduct).breakdown.claimSafety.raw).toBe(1);
  });
});

describe('scoreProduct — config overrides', () => {
  it('respects custom weights', () => {
    const onlyPrice: ScoreConfig = {
      ...DEFAULT_SCORE_CONFIG,
      weights: { demonstrability: 0, priceRange: 1, commissionVsCost: 0, claimSafety: 0 },
    };
    // Inside the band, price raw = 1 => score 100 when only price is weighted.
    expect(scoreProduct({ ...idealProduct, price_brl: 80 }, onlyPrice).score).toBe(100);
  });
  it('respects a custom impulse band', () => {
    const wideBand: ScoreConfig = {
      ...DEFAULT_SCORE_CONFIG,
      price: { idealMin: 10, idealMax: 500, hardMin: 1, hardMax: 1000 },
    };
    expect(scoreProduct({ ...idealProduct, price_brl: 300 }, wideBand).breakdown.priceRange.raw).toBe(1);
  });
});

describe('scoreProduct — ranking the seed catalog', () => {
  it('ranks demonstrable utilities above the blocked beauty serum', () => {
    const seed: ScorableProduct[] = [
      { title: 'Cortador de legumes 8 em 1', price_brl: 79.9, commission_pct: 18, category: 'cozinha' },
      { title: 'Organizador de cabos magnético', price_brl: 49.9, commission_pct: 22, category: 'tech_acessorios' },
      { title: 'Luminária LED dobrável', price_brl: 119.9, commission_pct: 15, category: 'casa' },
      { title: 'Sérum facial clareador (uso contínuo)', price_brl: 89.9, commission_pct: 25, category: 'beleza' },
    ];
    const ranked = seed
      .map((p) => ({ title: p.title, ...scoreProduct(p) }))
      .sort((a, b) => b.score - a.score);
    expect(ranked[ranked.length - 1]!.title).toMatch(/Sérum/);
    expect(ranked[ranked.length - 1]!.score).toBe(0);
    expect(ranked[0]!.score).toBeGreaterThan(50);
  });
});
