/**
 * Product selection score (spec §6).
 *
 * `scoreProduct` is a PURE, deterministic function: same input + same config =>
 * same output. No I/O, no clock, no randomness. This is the heart of the
 * approval queue ordering and is unit-tested in `score.test.ts`.
 *
 * The master principle (SPEC §1): the bottleneck is producing content the TikTok
 * algorithm won't demote — so we bias hard toward products that DEMONSTRATE in
 * <=15s, sit in the impulse-buy price band, whose commission comfortably covers
 * the per-unit production cost, and that carry no prohibited health/beauty claim.
 *
 * The returned `breakdown` explains every component so the dashboard can show the
 * operator *why* a product scored the way it did (auditable, spec §6).
 */

import type { AffiliatePlatform } from './state-machine.js';

/** The minimal product shape the scorer needs. A subset of the `products` row. */
export interface ScorableProduct {
  readonly title: string;
  /** BRL list price. */
  readonly price_brl: number;
  /** Affiliate commission, percent (0..100). */
  readonly commission_pct: number;
  /** Free-text catalog category (normalized internally). May be null/empty. */
  readonly category?: string | null;
  readonly affiliate_platform?: AffiliatePlatform;
}

/** One component of the score, kept in `breakdown` for auditing in the panel. */
export interface ScoreComponent {
  /** Raw 0..1 quality for this dimension before weighting. */
  readonly raw: number;
  /** Weight applied (from config). */
  readonly weight: number;
  /** raw * weight — the contribution to the (pre-normalization) sum. */
  readonly weighted: number;
  /** Human-readable explanation shown in the approval queue. */
  readonly reason: string;
}

export interface ScoreBreakdown {
  readonly demonstrability: ScoreComponent;
  readonly priceRange: ScoreComponent;
  readonly commissionVsCost: ScoreComponent;
  readonly claimSafety: ScoreComponent;
  /** True when the product is disqualified outright (blocked category/claim). */
  readonly blocked: boolean;
  /** Why it was blocked (empty when not blocked). */
  readonly blockReasons: readonly string[];
  /** Derived economics surfaced for the unit-economics view (T7/T8). */
  readonly economics: {
    readonly commissionBrl: number;
    readonly productionCostBrl: number;
    /** commissionBrl / productionCostBrl (Infinity if cost is 0). */
    readonly coverageRatio: number;
  };
}

export interface ScoreResult {
  /** Final score 0..100 (0 when blocked). Higher = better candidate. */
  readonly score: number;
  readonly breakdown: ScoreBreakdown;
}

// ---------------------------------------------------------------------------
// Configuration (weights & thresholds adjustable per spec §6)
// ---------------------------------------------------------------------------

export interface ScoreConfig {
  /** Relative weights of each dimension; need not sum to 1 (normalized at the end). */
  readonly weights: {
    readonly demonstrability: number;
    readonly priceRange: number;
    readonly commissionVsCost: number;
    readonly claimSafety: number;
  };
  /** Impulse-buy price band (BRL). Ideal range scores 1.0; falls off to the hard edges. */
  readonly price: {
    readonly idealMin: number;
    readonly idealMax: number;
    readonly hardMin: number;
    readonly hardMax: number;
  };
  /** Per-unit production economics used by the commission-vs-cost dimension. */
  readonly economics: {
    /** Assumed video length for the cost estimate. */
    readonly videoDurationMinutes: number;
    /** HeyGen Avatar III default rate (US$/min). */
    readonly costPerMinuteUsd: number;
    /** FX used to convert the USD production cost to BRL for comparison. */
    readonly usdToBrl: number;
    /** Safety multiplier on top of raw cost (overhead/margin). */
    readonly marginMultiplier: number;
    /** Coverage ratio (commission / cost) at which this dimension hits 1.0. */
    readonly targetCoverageRatio: number;
  };
  /** Category taxonomy (lowercased, accent-insensitive keys). */
  readonly categories: {
    /** Demonstrates functionally in <=15s — kitchen/home/tech/gadget. */
    readonly demonstrabilityHigh: readonly string[];
    /** Demonstrable but weaker — fitness gear, toys, stationery, garden. */
    readonly demonstrabilityMedium: readonly string[];
    /** Hard to demo / aesthetic — fashion, apparel, jewelry, cosmetics. */
    readonly demonstrabilityLow: readonly string[];
    /** Requires biological-proof claims => disqualified outright. */
    readonly claimBlocked: readonly string[];
    /** Claim-sensitive (beauty/skincare): allowed but penalized. */
    readonly claimRisky: readonly string[];
  };
  /**
   * Substrings that, found in a product title, signal a prohibited TikTok claim
   * (cure/whitening/weight-loss/etc.). Presence disqualifies the product.
   */
  readonly prohibitedClaimTerms: readonly string[];
}

export const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  weights: {
    demonstrability: 0.35,
    priceRange: 0.2,
    commissionVsCost: 0.3,
    claimSafety: 0.15,
  },
  price: { idealMin: 30, idealMax: 150, hardMin: 10, hardMax: 300 },
  economics: {
    videoDurationMinutes: 1,
    costPerMinuteUsd: 1, // Avatar III default (spec §2)
    usdToBrl: 5.5,
    marginMultiplier: 2, // commission must beat 2x raw cost to start scoring
    targetCoverageRatio: 4, // 4x cost coverage => full marks
  },
  categories: {
    demonstrabilityHigh: [
      'cozinha',
      'casa',
      'utilidades',
      'utilidades_domesticas',
      'organizacao',
      'limpeza',
      'tech',
      'tech_acessorios',
      'eletronicos',
      'gadget',
      'gadgets',
      'acessorios_tech',
      'pet',
      'pets',
      'automotivo',
      'ferramentas',
      'escritorio',
      'jardim',
    ],
    demonstrabilityMedium: [
      'fitness',
      'esporte',
      'esportes',
      'brinquedos',
      'papelaria',
      'viagem',
      'bebe',
      'infantil',
    ],
    demonstrabilityLow: [
      'moda',
      'roupas',
      'vestuario',
      'acessorios_moda',
      'calcados',
      'joias',
      'bijuteria',
      'beleza',
      'cosmeticos',
      'maquiagem',
      'skincare',
    ],
    claimBlocked: [
      'suplemento',
      'suplementos',
      'emagrecedor',
      'emagrecimento',
      'medicamento',
      'farmacia',
      'vitamina',
      'vitaminas',
      'nutraceutico',
      'saude',
      'sexual',
    ],
    claimRisky: ['beleza', 'cosmeticos', 'maquiagem', 'skincare', 'dermocosmetico', 'capilar'],
  },
  prohibitedClaimTerms: [
    'emagrec',
    'clareador',
    'clareia',
    'clareamento',
    'cura ',
    'cura,',
    'tratamento',
    'trata ',
    'elimina ',
    'queima gordura',
    'anti-ruga',
    'antirruga',
    'rejuvenesc',
    'crescimento capilar',
    'afrodisiac',
    'detox',
    'milagr',
    'remede',
    'remedio',
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Lowercase, strip accents, collapse spaces — so 'Tech Acessórios' == 'tech_acessorios'-ish. */
export function normalizeCategory(category: string | null | undefined): string {
  if (!category) return '';
  return category
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // drop combining accents
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_');
}

function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Dimension scorers
// ---------------------------------------------------------------------------

function scoreDemonstrability(catNorm: string, cfg: ScoreConfig): { raw: number; reason: string } {
  if (cfg.categories.demonstrabilityHigh.includes(catNorm)) {
    return { raw: 1, reason: `Categoria "${catNorm}" demonstra função em <=15s (alta).` };
  }
  if (cfg.categories.demonstrabilityMedium.includes(catNorm)) {
    return { raw: 0.6, reason: `Categoria "${catNorm}" demonstrável, porém mais fraca (média).` };
  }
  if (cfg.categories.demonstrabilityLow.includes(catNorm)) {
    return { raw: 0.3, reason: `Categoria "${catNorm}" estética/difícil de demonstrar (baixa).` };
  }
  // Unknown category: neutral-low. Operator can recategorize.
  return { raw: 0.4, reason: catNorm ? `Categoria "${catNorm}" desconhecida (neutra).` : 'Sem categoria (neutra).' };
}

function scorePriceRange(price: number, cfg: ScoreConfig): { raw: number; reason: string } {
  const { idealMin, idealMax, hardMin, hardMax } = cfg.price;
  if (price >= idealMin && price <= idealMax) {
    return { raw: 1, reason: `R$${price.toFixed(2)} dentro da faixa de impulso (R$${idealMin}–${idealMax}).` };
  }
  if (price < idealMin) {
    const raw = clamp01((price - hardMin) / (idealMin - hardMin));
    return { raw, reason: `R$${price.toFixed(2)} abaixo da faixa ideal (comissão tende a ser baixa).` };
  }
  const raw = clamp01((hardMax - price) / (hardMax - idealMax));
  return { raw, reason: `R$${price.toFixed(2)} acima da faixa ideal (impulso de compra cai).` };
}

function scoreCommissionVsCost(
  commissionBrl: number,
  productionCostBrl: number,
  cfg: ScoreConfig,
): { raw: number; reason: string; coverageRatio: number } {
  const coverageRatio = productionCostBrl > 0 ? commissionBrl / productionCostBrl : Infinity;
  const target = cfg.economics.targetCoverageRatio;
  // Below 1x cost => 0 (doesn't even cover production). Linear up to target => 1.
  const raw = target > 1 ? clamp01((coverageRatio - 1) / (target - 1)) : coverageRatio >= 1 ? 1 : 0;
  const reason =
    coverageRatio === Infinity
      ? `Comissão R$${commissionBrl.toFixed(2)} vs custo ~R$0 (custo de produção não configurado).`
      : `Comissão R$${commissionBrl.toFixed(2)} cobre ${coverageRatio.toFixed(1)}x o custo de produção (~R$${productionCostBrl.toFixed(2)}).`;
  return { raw, reason, coverageRatio };
}

function scoreClaimSafety(
  catNorm: string,
  titleNorm: string,
  cfg: ScoreConfig,
): { raw: number; reason: string; blocked: boolean; blockReasons: string[] } {
  const blockReasons: string[] = [];

  if (cfg.categories.claimBlocked.includes(catNorm)) {
    blockReasons.push(`Categoria "${catNorm}" exige prova de resultado biológico (bloqueada no TikTok).`);
  }

  const hitTerm = cfg.prohibitedClaimTerms.find((term) => titleNorm.includes(term));
  if (hitTerm) {
    blockReasons.push(`Título contém claim proibido ("${hitTerm.trim()}").`);
  }

  if (blockReasons.length > 0) {
    return { raw: 0, reason: blockReasons.join(' '), blocked: true, blockReasons };
  }

  if (cfg.categories.claimRisky.includes(catNorm)) {
    return {
      raw: 0.5,
      reason: `Categoria "${catNorm}" é sensível a claims (permitida, mas penalizada).`,
      blocked: false,
      blockReasons,
    };
  }

  return { raw: 1, reason: 'Sem claim sensível detectado.', blocked: false, blockReasons };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Per-unit production cost in BRL implied by the config (HeyGen cost * margin * FX). */
export function productionCostBrl(cfg: ScoreConfig = DEFAULT_SCORE_CONFIG): number {
  const { videoDurationMinutes, costPerMinuteUsd, usdToBrl, marginMultiplier } = cfg.economics;
  return videoDurationMinutes * costPerMinuteUsd * usdToBrl * marginMultiplier;
}

/** Estimated affiliate commission in BRL for a product. */
export function commissionBrl(product: ScorableProduct): number {
  return (product.price_brl * product.commission_pct) / 100;
}

/**
 * Score a product 0..100 with an auditable breakdown (spec §6).
 *
 * A blocked product (prohibited category or claim) returns score 0 with
 * `breakdown.blocked = true` — it should never enter the pipeline regardless of
 * how well it scores on the other axes.
 */
export function scoreProduct(
  product: ScorableProduct,
  config: ScoreConfig = DEFAULT_SCORE_CONFIG,
): ScoreResult {
  const catNorm = normalizeCategory(product.category);
  const titleNorm = normalizeTitle(product.title);

  const commission = commissionBrl(product);
  const prodCost = productionCostBrl(config);

  const demo = scoreDemonstrability(catNorm, config);
  const price = scorePriceRange(product.price_brl, config);
  const comm = scoreCommissionVsCost(commission, prodCost, config);
  const claim = scoreClaimSafety(catNorm, titleNorm, config);

  const w = config.weights;
  const mk = (raw: number, weight: number, reason: string): ScoreComponent => ({
    raw,
    weight,
    weighted: raw * weight,
    reason,
  });

  const breakdown: ScoreBreakdown = {
    demonstrability: mk(demo.raw, w.demonstrability, demo.reason),
    priceRange: mk(price.raw, w.priceRange, price.reason),
    commissionVsCost: mk(comm.raw, w.commissionVsCost, comm.reason),
    claimSafety: mk(claim.raw, w.claimSafety, claim.reason),
    blocked: claim.blocked,
    blockReasons: claim.blockReasons,
    economics: {
      commissionBrl: commission,
      productionCostBrl: prodCost,
      coverageRatio: comm.coverageRatio,
    },
  };

  if (claim.blocked) {
    return { score: 0, breakdown };
  }

  const weightSum = w.demonstrability + w.priceRange + w.commissionVsCost + w.claimSafety;
  const weighted =
    breakdown.demonstrability.weighted +
    breakdown.priceRange.weighted +
    breakdown.commissionVsCost.weighted +
    breakdown.claimSafety.weighted;
  const score = weightSum > 0 ? (weighted / weightSum) * 100 : 0;

  // Round to 2 decimals to keep the numeric(.) column and UI tidy and deterministic.
  return { score: Math.round(score * 100) / 100, breakdown };
}
